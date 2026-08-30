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

  /**
   * On the very first edit — before any config record exists — `ensure()`
   * creates one and `repo.update()` right after used to silently no-op:
   * the repo's internal records ref only catches up on the next render, so
   * an update fired in the same tick as the create couldn't find it yet.
   * That's why a first-ever holiday deletion looked like it "came back" —
   * it was never actually saved. Folding the desired final data straight
   * into the create call sidesteps that race entirely.
   */
  const updateCfg = useCallback((patch) => {
    if (!record) {
      return repo.create(CONFIG_TYPE, {
        title: 'Overtime rules',
        data: { cfg: { ...DEF_CFG, ...patch }, holidays: Object.fromEntries(SEED_HOLIDAYS) },
      });
    }
    return repo.update(record.id, { data: { ...record.data, cfg: { ...(record.data.cfg || DEF_CFG), ...patch } } });
  }, [record, repo]);

  const setHolidays = useCallback((next) => {
    if (!record) {
      return repo.create(CONFIG_TYPE, { title: 'Overtime rules', data: { cfg: DEF_CFG, holidays: next } });
    }
    return repo.update(record.id, { data: { ...record.data, holidays: next } });
  }, [record, repo]);

  return { cfg, holidays, record, ensure, updateCfg, setHolidays };
}
