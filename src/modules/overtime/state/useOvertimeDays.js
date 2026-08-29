import { useCallback, useMemo } from 'react';
import { useRepo } from '../../../core/db/repo';

export const DAY_TYPE = 'overtime.day';

const personLinkId = (record) => record.links?.find((l) => l.rel === 'person')?.id || null;
const dayKey = (personId, date) => `${personId}|${date}`;

/**
 * Loads every overtime.day record and indexes it by person+date, exposing
 * the `dayOf(no, date)` shape overtimeEngine.js's ctx expects. Bulk imports
 * go through repo.bulkWrite (one batch write) rather than one repo.create
 * per day — the repo's own comment on bulkWrite says as much for anything
 * importing more than a handful of records, and a month for one person is
 * ~13-31 of them.
 */
export function useOvertimeDays() {
  const repo = useRepo();
  const dayRecords = repo.query({ type: DAY_TYPE });

  const byKey = useMemo(() => {
    const m = new Map();
    dayRecords.forEach((r) => {
      const personId = personLinkId(r);
      if (personId && r.data.date) m.set(dayKey(personId, r.data.date), r);
    });
    return m;
  }, [dayRecords]);

  const dayOf = useCallback((personId, date) => byKey.get(dayKey(personId, date))?.data, [byKey]);
  const recordFor = useCallback((personId, date) => byKey.get(dayKey(personId, date)) || null, [byKey]);

  const daysForPerson = useCallback((personId) => dayRecords
    .filter((r) => personLinkId(r) === personId)
    .sort((a, b) => a.data.date.localeCompare(b.data.date)), [dayRecords]);

  /** Writes a whole attendanceToDays() result for one person in one batch.
   *  `keepApprovals` carries forward existing supervisor decisions when a
   *  day is re-imported (HANDOVER.md §3.2: approvals live separate from the
   *  punch data precisely so a re-import can't lose them). */
  const importDays = useCallback((personId, daysByDate, opts = {}) => {
    const list = Object.entries(daysByDate).map(([date, day]) => {
      const existing = byKey.get(dayKey(personId, date));
      const data = { ...day, date };
      if (existing) {
        if (opts.keepApprovals && existing.data.appr) data.appr = { ...existing.data.appr, ...day.appr };
        return { ...existing, data, updatedAt: new Date().toISOString() };
      }
      return repo.draft(DAY_TYPE, { title: date, data, links: [{ rel: 'person', id: personId }] });
    });
    return repo.bulkWrite(list);
  }, [byKey, repo]);

  /** Patches one day directly — status edits, approval toggles. */
  const patchDay = useCallback((personId, date, patch) => {
    const existing = byKey.get(dayKey(personId, date));
    if (existing) return repo.update(existing.id, { data: { ...existing.data, ...patch } });
    return repo.create(DAY_TYPE, { title: date, data: { ...patch, date }, links: [{ rel: 'person', id: personId }] });
  }, [byKey, repo]);

  /** Adds a hand-entered extra-time record for a day, on top of whatever
   *  (if anything) is already on file for it — see overtimeEngine.js's
   *  normRecs, which always layers `manualRecs` in regardless of whether
   *  the day has real sessions or not. */
  const addManualEntry = useCallback((personId, date, entry) => {
    const existing = byKey.get(dayKey(personId, date));
    const base = existing ? existing.data : { status: 'work', schedS: null, schedE: null, appr: {}, src: 'manual' };
    const manualRecs = [...(Array.isArray(base.manualRecs) ? base.manualRecs : []), entry];
    if (existing) return repo.update(existing.id, { data: { ...base, manualRecs } });
    return repo.create(DAY_TYPE, { title: date, data: { ...base, manualRecs, date }, links: [{ rel: 'person', id: personId }] });
  }, [byKey, repo]);

  return { dayRecords, dayOf, recordFor, daysForPerson, importDays, patchDay, addManualEntry };
}
