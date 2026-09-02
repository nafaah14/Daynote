import { useCallback } from 'react';
import { parseMyOvertimesMhtml } from '../lib/legacyApprovalImport';
import { periodFor, dkey } from '../lib/overtimeEngine';
import { useOvertimeStaff } from './useOvertimeStaff';
import { useOvertimeDays } from './useOvertimeDays';

const LEG_PREFIX = 'leg_';
const toId = (s, e) => `${LEG_PREFIX}${(s || '').replace(/:/g, '')}_${(e || '').replace(/:/g, '')}`;

/** An `appr` entry this importer is free to redecide: either there isn't
 *  one, or the one there is was written by this same importer on an
 *  earlier run (stamped `src: 'legacy-import'`). ApprovalsQueue's own
 *  approve/reopen never stamps `src`, so a person's real decision is never
 *  matched here and is always left exactly as they made it. */
const isOwnDecision = (a) => a == null || a.src === 'legacy-import';

/**
 * Pure: turns one date's parsed claims plus whatever `manualRecs`/`appr`
 * already exist for it into the patch `patchDay` should write — no repo, no
 * React, so a re-import's self-correcting behaviour (see `isOwnDecision`)
 * can be pinned in a unit test without a repo/hook harness.
 *
 * `currentPeriodFrom` is the 16th-to-15th period the import is running in
 * (via `periodFor`) — a `pending` claim whose own period ended before that
 * one started has had 1-2 weeks to be decided in HRMS already, so it
 * auto-approves rather than waiting on a person; a still-open period leaves
 * it pending. `incomplete` claims are never auto-approved, matching HRMS's
 * own "not paid" stance on them, and reaching them un-decided.
 */
export function buildDayImport(date, dayClaims, existingData, currentPeriodFrom) {
  const priorManual = Array.isArray(existingData?.manualRecs) ? existingData.manualRecs : [];
  const keptManual = priorManual.filter((r) => !r.id?.startsWith(LEG_PREFIX));
  const appr = { ...(existingData?.appr || {}) };

  let approvedCount = 0, autoApprovedCount = 0, pendingCount = 0;

  const seen = new Map();
  const manualRecs = [...keptManual, ...dayClaims.map((c) => {
    let id = toId(c.start, c.end);
    const n = (seen.get(id) || 0) + 1; seen.set(id, n);
    if (n > 1) id = `${id}_${n}`;

    // What this claim would be worth if authorised. For an incomplete row
    // that is whatever HRMS already authorised (it just isn't payable while
    // those hours are still covering the weekly requirement); with nothing
    // authorised, the worked time itself.
    const appMin = c.status === 'approved' ? c.approvedMin
      : c.status === 'pending' ? c.pendingMin
      : (c.authorisedMin ?? c.durationMin);

    if (isOwnDecision(appr[id])) {
      if (c.status === 'approved') {
        appr[id] = { app: true, appMin, src: 'legacy-import' };
        approvedCount++;
      } else if (c.status === 'pending' && periodFor(date).to < currentPeriodFrom) {
        // Requested and its salary period has since closed — approve it,
        // but stamp it so the divergence from HRMS's own figure is visible.
        appr[id] = { app: true, appMin, autoApproved: true, src: 'legacy-import' };
        autoApprovedCount++;
      } else {
        // Incomplete, or pending with its period still open — held, not
        // paid. If a stale entry from an earlier import run said otherwise,
        // clear it rather than leaving it stuck approved.
        if (appr[id]) delete appr[id];
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

  const patch = {
    ...(existingData ? {} : { status: 'work', schedS: null, schedE: null, src: 'legacy-approval' }),
    manualRecs, appr, otFromClaims: true,
  };
  return { patch, approvedCount, autoApprovedCount, pendingCount };
}

/**
 * Groups one person's parsed OT claims by date and writes each date's real
 * claims as `manualRecs` + `appr` decisions — the same primitives
 * ApprovalsQueue.jsx itself reads and writes — plus `otFromClaims: true` so
 * overtimeEngine.js's normRecs() stops layering a card-based estimate on top
 * of them (see its own comment). Already-approved historical claims resolve
 * immediately; a "Pending approval" or genuinely unclaimed claim is left
 * for a real decision UNLESS its whole salary period has already closed —
 * see `buildDayImport` above for exactly how each claim is decided, and for
 * how a re-import can correct its own past mistakes without ever touching a
 * decision a person actually made. Flags (never blocks on) anything
 * inconsistent in the source file itself, per the user's explicit "no blind
 * copy-paste" requirement — surfaced in the import log rather than failing
 * silently or being dropped.
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
      const { patch, approvedCount: a, autoApprovedCount: aa, pendingCount: p } =
        buildDayImport(date, dayClaims, existing?.data || null, currentPeriodFrom);
      approvedCount += a; autoApprovedCount += aa; pendingCount += p;
      patchDay(person.id, date, patch);
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
