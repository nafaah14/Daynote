import { useCallback, useMemo } from 'react';
import { useRepo } from '../../../core/db/repo';
import { effectiveSessions } from '../lib/overtimeEngine';

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

  /** The engine reads `.sessions` through this getter alone (via
   *  `getDay`/`ctx.dayOf`), so folding punch edits into it here — instead of
   *  touching every place that reads sessions — is what makes a manually
   *  added or deleted punch flow straight into the OT calculation. */
  const dayOf = useCallback((personId, date) => {
    const data = byKey.get(dayKey(personId, date))?.data;
    if (!data || (!data.manualPunches?.length && !data.punchEdits)) return data;
    return { ...data, sessions: effectiveSessions(data) };
  }, [byKey]);
  const recordFor = useCallback((personId, date) => byKey.get(dayKey(personId, date)) || null, [byKey]);

  const daysForPerson = useCallback((personId) => dayRecords
    .filter((r) => personLinkId(r) === personId)
    .sort((a, b) => a.data.date.localeCompare(b.data.date)), [dayRecords]);

  /** A day is "protected" once a supervisor has actually acted on it —
   *  approved something, or added an entry by hand. Re-importing must never
   *  silently clobber that, so `importDays` holds these back by default and
   *  reports them as conflicts instead of overwriting them. */
  const isProtected = (data) => {
    if (!data) return false;
    const approved = data.appr && Object.values(data.appr).some((a) => a?.app);
    const manual = Array.isArray(data.manualRecs) && data.manualRecs.length > 0;
    const punchEdited = (Array.isArray(data.manualPunches) && data.manualPunches.length > 0) || !!data.punchEdits;
    return !!(approved || manual || punchEdited);
  };

  /** Writes a whole attendanceToDays() result for one person in one batch.
   *  Dates whose existing record is protected (see above) are skipped and
   *  returned as `conflicts` unless explicitly listed in `opts.forceDates` —
   *  the caller re-invokes with that set once the user has chosen to
   *  overwrite them anyway. */
  const importDays = useCallback((personId, daysByDate, opts = {}) => {
    const list = [];
    const conflicts = [];
    Object.entries(daysByDate).forEach(([date, day]) => {
      const existing = byKey.get(dayKey(personId, date));
      if (existing && isProtected(existing.data) && !opts.forceDates?.has(date)) {
        conflicts.push(date);
        return;
      }
      const data = { ...day, date };
      if (existing) {
        if (opts.keepApprovals && existing.data.appr) data.appr = { ...existing.data.appr, ...day.appr };
        // Imported HRMS claims are the authorised figures for a day and
        // cannot be reconstructed from card punches, so an attendance
        // re-import must carry them (and the approval decisions attached to
        // them) forward. "Replace with import" means replace the PUNCHES;
        // without this it silently reverted the day to a card-based
        // estimate and the report drifted away from HRMS.
        if (existing.data.otFromClaims) {
          data.otFromClaims = true;
          data.manualRecs = existing.data.manualRecs;
          data.appr = { ...(existing.data.appr || {}), ...(data.appr || {}) };
        }
        list.push({ ...existing, data, updatedAt: new Date().toISOString() });
      } else {
        list.push(repo.draft(DAY_TYPE, { title: date, data, links: [{ rel: 'person', id: personId }] }));
      }
    });
    if (list.length) repo.bulkWrite(list);
    return { written: list.length, conflicts };
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

  /** A hand-added punch — for a missed clock-in/out, or a day with no
   *  attendance data at all yet. Kept separate from `sessions` (same
   *  precedent as `manualRecs`), so it's reversible and never disturbs
   *  whatever was actually imported. No approval gate here: unlike an
   *  overtime entry, a punch is a fact a supervisor is directly asserting,
   *  not a claim someone else needs to sign off on. */
  const addManualPunch = useCallback((personId, date, punch) => {
    const existing = byKey.get(dayKey(personId, date));
    const base = existing ? existing.data : { status: 'work', schedS: null, schedE: null, appr: {}, src: 'manual' };
    const manualPunches = [...(Array.isArray(base.manualPunches) ? base.manualPunches : []), punch];
    if (existing) return repo.update(existing.id, { data: { ...base, manualPunches } });
    return repo.create(DAY_TYPE, { title: date, data: { ...base, manualPunches, date }, links: [{ rel: 'person', id: personId }] });
  }, [byKey, repo]);

  /** Soft-delete only — a removed punch stays in the log, greyed out and
   *  reversible, rather than disappearing outright. */
  const setPunchDeleted = useCallback((personId, date, punchId, deleted) => {
    const existing = byKey.get(dayKey(personId, date));
    if (!existing) return null;
    const punchEdits = { ...(existing.data.punchEdits || {}) };
    if (deleted) punchEdits[punchId] = { deleted: true }; else delete punchEdits[punchId];
    return repo.update(existing.id, { data: { ...existing.data, punchEdits } });
  }, [byKey, repo]);

  return {
    dayRecords, dayOf, recordFor, daysForPerson, importDays, patchDay, addManualEntry,
    addManualPunch, setPunchDeleted,
  };
}
