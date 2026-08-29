import { useCallback, useMemo } from 'react';
import { useRepo } from '../../../core/db/repo';
import { personBySid } from '../../../core/people';

export const STAFF_META_TYPE = 'overtime.staffMeta';

/**
 * Overtime never imports Roster's or Directory's module files — modules
 * never import each other, only core (see src/registry.js's rule). It reads
 * Roster's record type by name through the shared repo instead, exactly the
 * way a shared type string works for any cross-cutting query. This is what
 * makes basic salary come from Roster: Overtime never stores its own copy,
 * it reads `data.salary` off the linked roster.staff record every time.
 */
const ROSTER_STAFF_TYPE = 'roster.staff';

const personLinkId = (record) => record.links?.find((l) => l.rel === 'person')?.id || null;

export const staffMetaFields = (data = {}) => ({
  staffType: 'maintenance', dutyMin: 420, dutyDays: null, active: true, reported: null, ...data,
});

/**
 * Employee objects shaped for overtimeEngine.js. `no` is the linked
 * Directory person's record id — a stable internal key the engine uses for
 * day lookups — `sid` is the human staff/employee number, used for display
 * and for matching attendance CSV rows. Name, designation, dept and unit
 * come from the linked person (core/people.js); basic salary comes from the
 * linked Roster record — edit it once, in Roster, and it's correct here too.
 */
export function useOvertimeStaff() {
  const repo = useRepo();
  const metas = repo.query({ type: STAFF_META_TYPE });
  const rosterRecords = repo.query({ type: ROSTER_STAFF_TYPE });

  const rosterByPersonId = useMemo(() => {
    const m = new Map();
    rosterRecords.forEach((r) => { const pid = personLinkId(r); if (pid) m.set(pid, r); });
    return m;
  }, [rosterRecords]);

  const employees = useMemo(() => metas
    .map((m) => {
      const personId = personLinkId(m);
      if (!personId) return null;
      const person = repo.get(personId);
      const roster = rosterByPersonId.get(personId);
      return {
        no: personId,
        metaId: m.id,
        sid: person?.data.sid || '',
        name: person?.title || '(unlinked)',
        desig: person?.data.designation || '',
        dept: person?.data.dept || '',
        unit: person?.data.unit || '',
        staffType: m.data.staffType || 'maintenance',
        dutyMin: m.data.dutyMin || 420,
        dutyDays: m.data.dutyDays || null,
        active: m.data.active !== false,
        basic: roster?.data.salary || 0,
        hasRosterLink: !!roster,
        reported: m.data.reported || null,
      };
    })
    .filter(Boolean), [metas, repo, rosterByPersonId]);

  const employeeByPersonId = useMemo(() => new Map(employees.map((e) => [e.no, e])), [employees]);

  /** Finds (or creates) the overtime.staffMeta for a Directory person — used
   *  when an attendance import matches a staff number not yet brought into
   *  Overtime. */
  const ensureStaffMeta = useCallback((personId, defaults = {}) => {
    const existing = metas.find((m) => personLinkId(m) === personId);
    if (existing) return existing;
    const person = repo.get(personId);
    return repo.create(STAFF_META_TYPE, {
      title: person?.title || '',
      data: staffMetaFields(defaults),
      links: [{ rel: 'person', id: personId }],
    });
  }, [metas, repo]);

  const updateStaffMeta = useCallback((metaId, patch) => {
    const existing = metas.find((m) => m.id === metaId);
    return repo.update(metaId, { data: { ...existing?.data, ...patch } });
  }, [metas, repo]);

  /** Resolve a CSV row's employee number to a Directory person. Overtime
   *  never creates people itself — an unmatched number is reported to the
   *  import log, not silently invented (creating people stays Directory's job). */
  const resolvePersonBySid = useCallback((sid) => personBySid(repo, sid), [repo]);

  return { employees, employeeByPersonId, ensureStaffMeta, updateStaffMeta, resolvePersonBySid };
}
