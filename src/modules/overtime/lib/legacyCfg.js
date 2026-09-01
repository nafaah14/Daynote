/**
 * Config for the pre-Aug-2026 OT rules, replaced by the 48h weekly-line
 * system this engine otherwise implements. Every mechanism this needs — the
 * weekly line, per-status leave credit, Friday-as-holiday, off-day work
 * counting as full OT — is already parametrized by `cfg` in
 * overtimeEngine.js, so the old rules are just a different `cfg` object run
 * through the exact same `runRange`/`forecast`, not a separate engine. This
 * is report-only: never used for real approvals, never written to a day
 * record.
 *
 * `attendanceGraceMin` is pushed absurdly high to neutralise
 * `scheduleMismatch()` — the schedule-vs-attendance absence check is a
 * concept that didn't exist under the old rules, and it has no dedicated
 * on/off switch, but its whole test is `Math.abs(firstIn - schedS) >
 * attendanceGraceMin`, so a large enough grace makes it structurally always
 * false. `holidayMissingPunch` needs no equivalent treatment — it only sets
 * a display flag, never zeroes credit.
 */
import { DEF_CFG, runRange, rateOf } from './overtimeEngine';

export const LEGACY_CFG = {
  ...DEF_CFG,
  weeklyThresholdMin: 35 * 60,
  annualCreditMin: 7 * 60,
  casualCreditMin: 7 * 60, // covers both 'casual' and 'sick' status
  frlCreditMin: 7 * 60,
  attendanceGraceMin: 100000,
  // A flat 7h/day duty credit regardless of the actual rostered shift length
  // (see dayFacts() in overtimeEngine.js) — the old rules paid the same
  // 08:00-15:00-equivalent baseline whether someone worked an 8h night shift
  // or the plain office day, with everything past that as OT.
  dutyMinFixed: 7 * 60,
};

/**
 * One person's old-system OT for a period, priced at today's live rate and
 * multiplier settings (`liveCfg`) rather than the legacy cfg's own copies —
 * per how the comparison report is meant to be read, the question is "what
 * would this have cost under the old hours, at what we actually pay now,"
 * not a reconstruction of old-era pay rates.
 *
 * The minutes figure is `recorded` (every minute worked past the scheduled
 * day's end, summed — see legacyReconciliation.test.js), not the weekly-
 * line-gated `otMin` runRange also returns: the old rules never gated OT
 * weekly at all, confirmed against the reference HRMS export. That ungated
 * total has no genOT/pubOT split of its own, so the public/general minutes
 * used for pricing are re-bucketed here from each day's own holiday/off flag.
 */
export function legacyTotals(emp, from, to, legacyCtx, liveCfg) {
  const result = runRange(emp, from, to, legacyCtx, {});
  let pubMin = 0, genMin = 0;
  result.days.forEach((d) => {
    if (d.holiday || d.status === 'holiday') pubMin += d.otRec;
    else genMin += d.otRec;
  });
  const rate = rateOf(emp, liveCfg);
  const weighted = genMin * liveCfg.generalMult + pubMin * liveCfg.publicMult;
  const amount = (weighted / 60) * rate;
  const pct = liveCfg.monthlyHours > 0 ? (weighted / 60) / liveCfg.monthlyHours * 100 : 0;
  return { otMin: result.recorded, amount, pct };
}
