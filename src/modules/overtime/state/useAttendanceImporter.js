import { useCallback } from 'react';
import { parseAttendance, attendanceToDays } from '../lib/attendanceImport';
import { useOvertimeStaff } from './useOvertimeStaff';
import { useOvertimeDays } from './useOvertimeDays';
import { useOvertimeConfig } from './useOvertimeConfig';

/**
 * Ties the pure attendance parser to the repo: resolves each block's
 * employee number to a Directory person, ensures overtime.staffMeta exists,
 * and bulk-writes the day records. Returns a log — matched people, days
 * written, and any employee numbers with no matching Directory person —
 * mirroring HANDOVER.md §10's "Import ... with a log and reconciliation
 * deltas" feature.
 */
export function useAttendanceImporter() {
  const { cfg } = useOvertimeConfig();
  const { ensureStaffMeta, resolvePersonBySid } = useOvertimeStaff();
  const { importDays } = useOvertimeDays();

  const importText = useCallback((text, opts = {}) => {
    const blocks = parseAttendance(text);
    const log = { matched: [], unmatched: [], days: 0 };
    blocks.forEach((att) => {
      const person = resolvePersonBySid(att.no);
      if (!person) { log.unmatched.push({ sid: att.no, name: att.name }); return; }
      const built = attendanceToDays(att, cfg, opts);
      // Only sets defaults the first time this person is brought into
      // Overtime — a staffType corrected by hand on the Rules screen is
      // never silently overwritten by a later re-import.
      ensureStaffMeta(person.id, {
        staffType: built.staffType,
        dutyMin: built.staffType === 'duty' ? cfg.shiftMin + cfg.handoverMin : 420,
        dutyDays: [...cfg.dutyDays],
      });
      importDays(person.id, built.days, opts);
      const dayCount = Object.keys(built.days).length;
      log.matched.push({ sid: att.no, name: person.title, days: dayCount });
      log.days += dayCount;
    });
    return log;
  }, [cfg, resolvePersonBySid, ensureStaffMeta, importDays]);

  return { importText };
}
