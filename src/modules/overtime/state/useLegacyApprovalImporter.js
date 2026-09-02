import { useCallback } from 'react';
import { parseMyOvertimesMhtml } from '../lib/legacyApprovalImport';
import { useOvertimeStaff } from './useOvertimeStaff';
import { useOvertimeDays } from './useOvertimeDays';

/**
 * Groups one person's parsed OT claims by date and writes each date's real
 * `legacyApprovedMin`/`legacyClaims` onto its overtime.day record via the
 * already-existing `patchDay` — purely additive fields dayFacts()/runWeek()
 * never read, so this can never change anyone's live 48h-system numbers.
 * Flags (never blocks on) anything inconsistent in the source file itself —
 * per the user's explicit "no blind copy-paste" requirement, these surface
 * in the import log rather than failing silently or being dropped.
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

    const flags = [];
    byDate.forEach((dayClaims, date) => {
      dayClaims.forEach((c) => {
        if (c.durationCheckOk === false) {
          flags.push(`${date}: stated duration doesn't match its own start/end time on file.`);
        }
      });
      const withLimit = dayClaims.filter((c) => c.dailyLimitMin != null);
      if (withLimit.length > 1) {
        const limit = withLimit[0].dailyLimitMin;
        const usedSum = withLimit.reduce((s, c) => s + (c.usedLimitMin || 0), 0);
        if (usedSum !== limit) {
          flags.push(`${date}: ${withLimit.length} claims' used-limit adds up to ${usedSum}min, not the stated ${limit}min daily limit.`);
        }
      }
      const legacyApprovedMin = dayClaims.reduce((s, c) => s + (c.approvedMin || 0), 0);
      const existing = recordFor(person.id, date);
      patchDay(person.id, date, {
        ...(existing ? {} : { status: 'work', schedS: null, schedE: null, appr: {}, src: 'legacy-approval' }),
        legacyApprovedMin, legacyClaims: dayClaims,
      });
    });

    return { matched: [{ sid: employeeSid, name: person.title }], unmatched: [], days: byDate.size, flags };
  }, [resolvePersonBySid, ensureStaffMeta, patchDay, recordFor]);

  return { importText };
}
