import { useCallback } from 'react';
import { parseMyOvertimesMhtml } from '../lib/legacyApprovalImport';
import { periodFor, dkey, hm } from '../lib/overtimeEngine';
import { useOvertimeStaff } from './useOvertimeStaff';
import { useOvertimeDays } from './useOvertimeDays';

const LEG_PREFIX = 'leg_';
const toId = (s, e) => `${LEG_PREFIX}${(s || '').replace(/:/g, '')}_${(e || '').replace(/:/g, '')}`;

/** An `appr` entry this importer is free to redecide on its own: either
 *  there isn't one, or the one there is was written by this same importer
 *  on an earlier run (stamped `src: 'legacy-import'`). The Overtime page's
 *  own approve/reopen never stamps `src`, so a person's real decision is
 *  never matched here — touching one always requires an explicit `mode`. */
const isOwnDecision = (a) => a == null || a.src === 'legacy-import';

const describe = (a) => (a == null ? 'unapproved' : a.app ? `approved, ${hm(a.appMin)}` : `held at ${hm(a.appMin)}`);

/**
 * Pure: turns one date's parsed claims plus whatever `manualRecs`/`appr`
 * already exist for it into the patch `patchDay` should write — no repo, no
 * React, so this and the self-correcting/conflict behaviour below can be
 * pinned in a unit test without a repo/hook harness.
 *
 * `mode` decides what happens where the file disagrees with a decision a
 * person actually made:
 *   - 'skip' (default): leave it exactly as they made it, and report it as
 *     a conflict rather than silently doing nothing.
 *   - 'force': let the file win for those specific claims.
 *   - 'replace': ignore whatever this date already holds entirely (as if
 *     `existingData` were empty) and rebuild it purely from this file — for
 *     when old or malformed data needs a clean slate, not a per-claim merge.
 *
 * `currentPeriodFrom` is the 16th-to-15th period the import is running in
 * (via `periodFor`) — a `pending` claim whose own period ended before that
 * one started has had 1-2 weeks to be decided in HRMS already, so it
 * auto-approves rather than waiting on a person; a still-open period leaves
 * it pending. `incomplete` claims are never auto-approved, matching HRMS's
 * own "not paid" stance on them, and reaching them un-decided.
 */
export function buildDayImport(date, dayClaims, existingData, currentPeriodFrom, mode = 'skip') {
  const data = mode === 'replace' ? null : existingData;
  const priorManual = Array.isArray(data?.manualRecs) ? data.manualRecs : [];
  const keptManual = priorManual.filter((r) => !r.id?.startsWith(LEG_PREFIX));
  const appr = { ...(data?.appr || {}) };

  let approvedCount = 0, autoApprovedCount = 0, pendingCount = 0;
  const conflicts = [];

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

    const decide = mode !== 'skip' || isOwnDecision(appr[id]);
    if (!decide) {
      conflicts.push({
        date, id, s: c.start, e: c.end,
        existing: describe(appr[id]),
        fromFile: c.status === 'approved' ? `approved, ${hm(appMin)}` : `held at ${hm(appMin)}`,
      });
    } else {
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
    ...(data ? {} : { status: 'work', schedS: null, schedE: null, src: 'legacy-approval' }),
    // A clean slate really is clean: drop the pre-manualRecs flat fields an
    // older version of this importer used to write, not just the current
    // ones — the exact shape found stuck on real historical data this
    // session (legacyApprovedMin/legacyClaims from before manualRecs/appr
    // existed at all), which a per-claim merge would otherwise never touch.
    ...(mode === 'replace' ? { legacyApprovedMin: null, legacyClaims: null } : {}),
    manualRecs, appr, otFromClaims: true,
  };
  return { patch, approvedCount, autoApprovedCount, pendingCount, conflicts };
}

/**
 * Groups one person's parsed OT claims by date. `mode` is undefined on the
 * first call for a file — in that case this is a dry run: nothing is
 * written, and if any claim would conflict with a decision made by hand,
 * the whole import comes back as `needsDecision` with a `conflicts` list
 * naming exactly which claims and what each holds now vs what the file
 * says, so the choice can be made with the real numbers in view rather than
 * abstractly. Once the caller picks `mode` ('skip' | 'force' | 'replace')
 * and calls again, this actually writes.
 *
 * Already-approved historical claims resolve immediately; a "Pending
 * approval" or genuinely unclaimed claim is left for a real decision UNLESS
 * its whole salary period has already closed — see `buildDayImport` above
 * for exactly how each claim is decided. Flags (never blocks on) anything
 * inconsistent in the source file itself, per the user's explicit "no
 * blind copy-paste" requirement — surfaced in the import log rather than
 * failing silently or being dropped.
 */
export function useLegacyApprovalImporter() {
  const { resolvePersonBySid, ensureStaffMeta } = useOvertimeStaff();
  const { patchDay, recordFor } = useOvertimeDays();

  const importText = useCallback((text, opts = {}) => {
    const { employeeName, employeeSid, claims } = parseMyOvertimesMhtml(text);
    const person = resolvePersonBySid(employeeSid);
    if (!person) {
      return { matched: [], unmatched: [{ sid: employeeSid, name: employeeName }], days: 0, flags: [] };
    }

    const byDate = new Map();
    claims.forEach((c) => {
      if (!byDate.has(c.date)) byDate.set(c.date, []);
      byDate.get(c.date).push(c);
    });

    const currentPeriodFrom = periodFor(dkey(new Date())).from;
    const durationFlags = [];
    claims.forEach((c) => {
      if (c.durationCheckOk === false) {
        durationFlags.push(`${c.date}: stated duration doesn't match its own start/end time on file.`);
      }
    });

    const run = (mode) => {
      const perDate = [];
      byDate.forEach((dayClaims, date) => {
        perDate.push({ date, r: buildDayImport(date, dayClaims, recordFor(person.id, date)?.data || null, currentPeriodFrom, mode) });
      });
      return perDate;
    };

    // Dry run first, always — this is how conflicts are found without
    // writing anything, whether or not the caller already picked a mode
    // (picking 'skip' still needs to know what it left untouched).
    const dry = run('skip');
    const conflicts = dry.flatMap(({ r }) => r.conflicts);

    if (conflicts.length > 0 && !opts.mode) {
      return {
        matched: [{ sid: employeeSid, name: person.title }], unmatched: [], needsDecision: true,
        conflicts, flags: durationFlags, claimCount: claims.length,
      };
    }

    // This page carries no schedule info to detect staffType from — same
    // precedent as useAttendanceImporter, only the first import for a
    // person sets defaults, so a later correction on the Rules/Staff screen
    // is never silently overwritten by a re-import.
    ensureStaffMeta(person.id);

    const mode = opts.mode || 'skip';
    const results = run(mode);
    let approvedCount = 0, autoApprovedCount = 0, pendingCount = 0;
    results.forEach(({ date, r }) => {
      approvedCount += r.approvedCount; autoApprovedCount += r.autoApprovedCount; pendingCount += r.pendingCount;
      patchDay(person.id, date, r.patch);
    });

    const stats = [`${claims.length} claim(s) read from the file.`];
    if (approvedCount > 0) stats.push(`${approvedCount} approved, matching HRMS.`);
    if (autoApprovedCount > 0) stats.push(`${autoApprovedCount} were pending in HRMS and auto-approved here — their salary period has closed. This is deliberately ahead of HRMS's approved figure.`);
    if (pendingCount > 0) stats.push(`${pendingCount} went toward the weekly requirement and are not paid by HRMS — left unapproved so the totals match.`);
    if (mode === 'force') stats.push(`${conflicts.length} claim(s) that carried a decision made by hand were overwritten with HRMS's figure — see below for exactly which.`);
    if (mode === 'replace') stats.push(`Every existing entry for the ${byDate.size} date(s) in this file was cleared and rebuilt from it.`);

    return {
      matched: [{ sid: employeeSid, name: person.title }], unmatched: [], days: byDate.size,
      flags: durationFlags, stats,
      approved: approvedCount, autoApproved: autoApprovedCount, pending: pendingCount,
      overwritten: mode === 'force' ? conflicts : [],
    };
  }, [resolvePersonBySid, ensureStaffMeta, patchDay, recordFor]);

  return { importText };
}
