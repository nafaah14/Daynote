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
import { DEF_CFG, runRange, rateOf, addD } from './overtimeEngine';

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
 * Splits a `runRange` result's days into public (holiday/Friday) vs general
 * OT minutes by each day's own holiday flag — the old rules' ungated
 * `recorded` total has no genOT/pubOT split of its own (that split only
 * exists on the new system's weekly-gated pool), so pricing it needs this
 * re-bucketing from scratch.
 *
 * `d.otRec` already reflects a real imported "My Overtimes" claim
 * (legacyApprovalImport.js) wherever one exists — normRecs()'s
 * `otFromClaims` flag makes the engine use the imported claim instead of a
 * card-based estimate at the source, so this needs no override of its own.
 */
function bucketPubGen(days) {
  let pubMin = 0, genMin = 0;
  days.forEach((d) => {
    if (d.holiday || d.status === 'holiday') pubMin += d.otRec;
    else genMin += d.otRec;
  });
  return { pubMin, genMin };
}

/**
 * One person's old-system OT for a period, priced at today's live rate and
 * multiplier settings (`liveCfg`) rather than the legacy cfg's own copies —
 * per how the comparison report is meant to be read, the question is "what
 * would this have cost under the old hours, at what we actually pay now,"
 * not a reconstruction of old-era pay rates.
 *
 * The minutes figure is every minute worked past the scheduled day's end,
 * summed (see legacyReconciliation.test.js) — or the real imported approved
 * figure for any date that has one — not the weekly-line-gated `otMin`
 * runRange also returns: the old rules never gated OT weekly at all,
 * confirmed against the reference HRMS export.
 */
export function legacyTotals(emp, from, to, legacyCtx, liveCfg) {
  const result = runRange(emp, from, to, legacyCtx, {});
  const { pubMin, genMin } = bucketPubGen(result.days);
  const rate = rateOf(emp, liveCfg);
  const weighted = genMin * liveCfg.generalMult + pubMin * liveCfg.publicMult;
  const amount = (weighted / 60) * rate;
  const pct = liveCfg.monthlyHours > 0 ? (weighted / 60) / liveCfg.monthlyHours * 100 : 0;
  return { otMin: pubMin + genMin, amount, pct };
}

/**
 * One person's OT for a period that may straddle `cutoverDate` — the days
 * before it measured under the old rules (ungated, priced at live rates via
 * the same approach as `legacyTotals`), the days at/after it measured under
 * the live 48h rules exactly as normal. A period entirely on one side of the
 * cutover just yields a zero half, so callers never need to special-case
 * "does this period actually straddle the change."
 *
 * The post-cutover slice runs through the *unmodified* live `ctx`/`runRange`
 * — deliberately, not a narrower reimplementation — so a boundary week that
 * starts before `cutoverDate` still correctly pulls its earlier days into
 * the 48h-line calculation for the in-range days, exactly as `runRange`
 * already does for any other custom date range.
 */
export function transitionTotals(emp, from, to, ctx, cutoverDate) {
  const cfg = ctx.cfg;
  const rate = rateOf(emp, cfg);
  let preOtMin = 0, preWeighted = 0;
  let postOtMin = 0, postWeighted = 0;

  if (from < cutoverDate) {
    const preTo = to < cutoverDate ? to : addD(cutoverDate, -1);
    const legacyCtx = { ...ctx, cfg: LEGACY_CFG };
    const preResult = runRange(emp, from, preTo, legacyCtx, {});
    const { pubMin, genMin } = bucketPubGen(preResult.days);
    preOtMin = pubMin + genMin;
    preWeighted = genMin * cfg.generalMult + pubMin * cfg.publicMult;
  }

  if (to >= cutoverDate) {
    const postFrom = from > cutoverDate ? from : cutoverDate;
    const postResult = runRange(emp, postFrom, to, ctx, {});
    postOtMin = postResult.otMin;
    postWeighted = postResult.weighted;
  }

  const weighted = preWeighted + postWeighted;
  const amount = (weighted / 60) * rate;
  const pct = cfg.monthlyHours > 0 ? (weighted / 60) / cfg.monthlyHours * 100 : 0;
  return { preOtMin, postOtMin, otMin: preOtMin + postOtMin, amount, pct, cutoverDate };
}
