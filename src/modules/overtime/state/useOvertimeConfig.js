import { useCallback, useMemo } from 'react';
import { useRepo } from '../../../core/db/repo';
import { DEF_CFG, SEED_HOLIDAYS } from '../lib/overtimeEngine';

export const CONFIG_TYPE = 'overtime.config';

/**
 * Overtime's single settings record — thresholds, multipliers, shift
 * pattern and the holiday list. There is no per-module settings registry in
 * Daybook (core/settings is app-wide only), so — like every other module —
 * this is just a record of the module's own type, edited from the module's
 * own Rules screen.
 */
export function useOvertimeConfig() {
  const repo = useRepo();
  const record = repo.query({ type: CONFIG_TYPE })[0] || null;

  const cfg = useMemo(() => ({ ...DEF_CFG, ...(record?.data?.cfg || {}) }), [record]);
  const holidays = useMemo(
    () => record?.data?.holidays || Object.fromEntries(SEED_HOLIDAYS),
    [record]
  );

  const ensure = useCallback(() => {
    if (record) return record;
    return repo.create(CONFIG_TYPE, {
      title: 'Overtime rules',
      data: { cfg: DEF_CFG, holidays: Object.fromEntries(SEED_HOLIDAYS) },
    });
  }, [record, repo]);

  const updateCfg = useCallback((patch) => {
    const rec = ensure();
    return repo.update(rec.id, { data: { ...rec.data, cfg: { ...(rec.data.cfg || DEF_CFG), ...patch } } });
  }, [ensure, repo]);

  const setHolidays = useCallback((next) => {
    const rec = ensure();
    return repo.update(rec.id, { data: { ...rec.data, holidays: next } });
  }, [ensure, repo]);

  return { cfg, holidays, record, ensure, updateCfg, setHolidays };
}
