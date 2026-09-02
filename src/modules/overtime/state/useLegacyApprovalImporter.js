import { useCallback } from 'react';
import { parseMyOvertimesMhtml } from '../lib/legacyApprovalImport';
import { periodFor, dkey } from '../lib/overtimeEngine';
import { useOvertimeStaff } from './useOvertimeStaff';
import { useOvertimeDays } from './useOvertimeDays';

const LEG_PREFIX = 'leg_';
const toId = (s, e) => `${LEG_PREFIX}${(s || '').replace(/:/g, '')}_${(e || '').replace(/:/g, '')}`;

/**
 * Groups one person's parsed OT claims by date and writes each date's real
 * claims as `manualRecs` + `appr` decisions — the same primitives
 * ApprovalsQueue.jsx itself reads and writes — plus `otFromClaims: true` so
 * overtimeEngine.js's normRecs() stops layering a card-based estimate on top
 * of them (see its own comment). Already-approved historical claims resolve
 * immediately; a "Pending approval" or genuinely unclaimed claim is left
 * for a real decision UNLESS its whole salary period has already closed, in
 * which case it auto-approves at the amount actually on record — approvals
 * lag real work by 1-2 weeks in practice, so a closed period's claims are
 * done deals, not something to make someone re-approve by hand.
 *
 * Never overwrites a decision already made in-app (whether from a previous
 * run of this same import, or a supervisor's own approve/reopen) — only an
 * `appr` id with no existing entry is ever set. Flags (never blocks on)
 * anything inconsistent in the source file itself, per the user's explicit
 * "no blind copy-paste" requirement — surfaced in the import log rather
 * than failing silently or being dropped.
 */
export function useLegacyApprovalImporter() {
  const { resolvePersonBySid, ensureStaffMeta } = useOvertimeStaff();
  const { patchDay, recordFor } = useOvertimeDays();

  const importText = useCallback((text) => {
    const { employeeName, employeeSid, claims } = parseMyOvertimesMhtml(text);
    const person = resolvePersonBySid(employeeSid);
    if (!person) {
      return { matched: [], unmatched: [{ sid: employeeSid, name: employeeName }], days: 0, flags: [] };
    }
    // This page carries no schedule info to detect staffType from — same
    // precedent as useAttendanceImporter, only the first import for a person
    // sets defaults, so a later correction on the Rules/Staff screen is
    // never silently overwritten by a re-import.
    ensureStaffMeta(person.id);

    const byDate = new Map();
    claims.forEach((c) => {
      if (!byDate.has(c.date)) byDate.set(c.date, []);
      byDate.get(c.date).push(c);
    });

    const currentPeriodFrom = periodFor(dkey(new Date())).from;
    const flags = [];
    let approvedCount = 0, autoApprovedCount = 0, pendingCount = 0;

    byDate.forEach((dayClaims, date) => {
      dayClaims.forEach((c) => {
        if (c.durationCheckOk === false) {
          flags.push(`${date}: stated duration doesn't match its own start/end time on file.`);
        }
      });

      const existing = recordFor(person.id, date);
      const priorManual = Array.isArray(existing?.data.manualRecs) ? existing.data.manualRecs : [];
      const keptManual = priorManual.filter((r) => !r.id?.startsWith(LEG_PREFIX));
      const priorAppr = existing?.data.appr || {};
      const appr = { ...priorAppr };

      const seen = new Map();
      const manualRecs = [...keptManual, ...dayClaims.map((c) => {
        let id = toId(c.start, c.end);
        const n = (seen.get(id) || 0) + 1; seen.set(id, n);
        if (n > 1) id = `${id}_${n}`;

        // What this claim would be worth if authorised. For an incomplete
        // row that is whatever HRMS already authorised (it just isn't
        // payable while those hours are still covering the weekly
        // requirement); with nothing authorised, the worked time itself.
        const appMin = c.status === 'approved' ? c.approvedMin
          : c.status === 'pending' ? c.pendingMin
          : (c.authorisedMin ?? c.durationMin);

        if (appr[id] == null) {
          if (c.status === 'approved') {
            appr[id] = { app: true, appMin };
            approvedCount++;
          } else if (c.status === 'pending' && periodFor(date).to < currentPeriodFrom) {
            // Requested and its salary period has since closed — approve it,
            // but stamp it so the divergence from HRMS stays visible.
            appr[id] = { app: true, appMin, autoApproved: true };
            autoApprovedCount++;
          } else {
            pendingCount++;
          }
        }

        return {
          id, s: c.start || '', e: c.end || '', min: c.durationMin || 0, appMin,
          kind: 'legacy', note: c.reason || '',
          // Worked and credited toward the weekly requirement, but not paid
          // unless somebody actually authorises it here.
          ...(c.status === 'approved' ? {} : { holdUntilApproved: true }),
        };
      })];

      patchDay(person.id, date, {
        ...(existing ? {} : { status: 'work', schedS: null, schedE: null, src: 'legacy-approval' }),
        manualRecs, appr, otFromClaims: true,
      });
    });

    if (autoApprovedCount > 0) flags.push(`${autoApprovedCount} claim(s) were pending in HRMS and were auto-approved here because their salary period has closed — this is ahead of HRMS's own approved figure by design.`);
    if (pendingCount > 0) flags.push(`${pendingCount} claim(s) counted toward the weekly requirement but are not paid — in the Approvals queue if you want to authorise them.`);

    return {
      matched: [{ sid: employeeSid, name: person.title }], unmatched: [], days: byDate.size, flags,
      approved: approvedCount, autoApproved: autoApprovedCount, pending: pendingCount,
    };
  }, [resolvePersonBySid, ensureStaffMeta, patchDay, recordFor]);

  return { importText };
}
