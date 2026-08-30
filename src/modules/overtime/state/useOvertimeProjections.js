import { useCallback, useMemo } from 'react';
import { useRepo } from '../../../core/db/repo';

export const PROJECTION_TYPE = 'overtime.projection';

const personLinkId = (record) => record.links?.find((l) => l.rel === 'person')?.id || null;

/**
 * Per-employee projection settings: which scenario to model future days
 * with, and any per-day estimate a supervisor has hand-adjusted from
 * `WeekDetails`. Kept separate from `overtime.staffMeta` since it's
 * viewing/modelling state, not payroll identity, and separate per person
 * (not per period) since dates are absolute — an override from a past
 * period simply stops being read once that period's dates are behind it.
 *
 * `scenario` is nullable: `null` means "follow the Overview-wide default"
 * (`cfg.defaultScenario`), an explicit value means this one person has been
 * pinned to it regardless of what the default is. Setting a new
 * Overview-wide default clears every person's pin — see
 * `clearAllScenarioOverrides` — so pins are a temporary "for right now"
 * exception, not a permanent fork from the rest of the unit.
 */
export function useOvertimeProjections() {
  const repo = useRepo();
  const records = repo.query({ type: PROJECTION_TYPE });

  const byPerson = useMemo(() => {
    const m = new Map();
    records.forEach((r) => { const pid = personLinkId(r); if (pid) m.set(pid, r); });
    return m;
  }, [records]);

  const projectionFor = useCallback((personId) => {
    const r = byPerson.get(personId);
    return { scenario: r?.data.scenario ?? null, overrides: r?.data.overrides || {} };
  }, [byPerson]);

  const setScenario = useCallback((personId, scenario) => {
    const existing = byPerson.get(personId);
    if (existing) return repo.update(existing.id, { data: { ...existing.data, scenario } });
    return repo.create(PROJECTION_TYPE, { title: 'Projection', data: { scenario, overrides: {} }, links: [{ rel: 'person', id: personId }] });
  }, [byPerson, repo]);

  const setOverride = useCallback((personId, date, minutes) => {
    const existing = byPerson.get(personId);
    const overrides = { ...(existing?.data.overrides || {}), [date]: minutes };
    if (existing) return repo.update(existing.id, { data: { ...existing.data, overrides } });
    return repo.create(PROJECTION_TYPE, { title: 'Projection', data: { scenario: null, overrides }, links: [{ rel: 'person', id: personId }] });
  }, [byPerson, repo]);

  const clearOverride = useCallback((personId, date) => {
    const existing = byPerson.get(personId);
    if (!existing) return null;
    const overrides = { ...(existing.data.overrides || {}) };
    delete overrides[date];
    return repo.update(existing.id, { data: { ...existing.data, overrides } });
  }, [byPerson, repo]);

  const clearAllOverrides = useCallback((personId) => {
    const existing = byPerson.get(personId);
    if (!existing) return null;
    return repo.update(existing.id, { data: { ...existing.data, overrides: {} } });
  }, [byPerson, repo]);

  /** Wipes every person's scenario pin at once — called whenever the
   *  Overview-wide default scenario changes, so a shift from a busy period
   *  back to normal times doesn't leave stale per-person exceptions behind. */
  const clearAllScenarioOverrides = useCallback(() => {
    records.forEach((r) => {
      if (r.data.scenario != null) repo.update(r.id, { data: { ...r.data, scenario: null } });
    });
  }, [records, repo]);

  return { projectionFor, setScenario, setOverride, clearOverride, clearAllOverrides, clearAllScenarioOverrides };
}
