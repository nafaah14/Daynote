import { useCallback } from 'react';
import { parseUnitReport } from '../lib/unitReportImport';
import { useOvertimeStaff } from './useOvertimeStaff';

/** Loads the HRMS unit report's `reported` figures onto each matched
 *  person's overtime.staffMeta, for the reconciliation panel. */
export function useUnitReportImporter() {
  const { resolvePersonBySid, ensureStaffMeta, updateStaffMeta } = useOvertimeStaff();

  const importReportText = useCallback((text) => {
    const rows = parseUnitReport(text);
    const log = { matched: [], unmatched: [] };
    rows.forEach((row) => {
      const person = resolvePersonBySid(row.no);
      if (!person) { log.unmatched.push({ sid: row.no, name: row.name }); return; }
      const meta = ensureStaffMeta(person.id);
      updateStaffMeta(meta.id, {
        reported: {
          workedMin: row.workedMin, extraMin: row.extraMin, otMin: row.otMin,
          amount: row.amount, pct: row.pct, at: Date.now(),
        },
      });
      log.matched.push({ sid: row.no, name: person.title });
    });
    return log;
  }, [resolvePersonBySid, ensureStaffMeta, updateStaffMeta]);

  return { importReportText };
}
