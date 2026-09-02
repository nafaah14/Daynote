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
 * Deliberately re-picks each day's own `recs` rather than reading `d.otRec`:
 * `otRec` is raw recorded time, which re-includes the unauthorised
 * "Incomplete Working Hours" the live system explicitly does not pay (see
 * `holdUntilApproved` in overtimeEngine.js's runWeek). The two pick
 * functions mirror that engine's own `pickPay`/`pickApp` exactly.
 */
const pickAll = (r) => (r.holdUntilApproved && !r.app ? 0 : r.min);
const pickApp = (r) => (r.app ? Math.min(r.appMin, r.min) : 0);

function bucketPubGen(days, approved = false) {
  const pick = approved ? pickApp : pickAll;
  let pubMin = 0, genMin = 0;
  days.forEach((d) => {
    const m = d.recs.reduce((s, r) => s + pick(r), 0);
    if (d.holiday || d.status === 'holiday') pubMin += m;
    else genMin += m;
  });
  return { pubMin, genMin };
}

/**
 * A range measured under whichever rules actually applied on each date —
 * the old ungated system before `cutoverDate`, the live 48h weekly-line
 * system on and after it — returned in the same shape `runRange` returns so
 * existing consumers (OvertimeReport's summary panels, pdfGen's
 * `generateIndividualOtPdf`) need no special handling.
 *
 * This is what any report spanning the changeover should use: measuring a
 * July day under the 48h rules suppresses OT that the old system paid
 * ungated, and measuring an August day under the old rules pays OT the new
 * system gates. A range wholly on one side of the cutover just yields an
 * empty half, so callers never special-case "does this straddle."
 *
 * The post-cutover slice runs through the unmodified live `runRange` so a
 * boundary week keeps its full 48h-line context, exactly as before.
 */
export function eraRange(emp, from, to, ctx, opts = {}) {
  const cfg = ctx.cfg;
  const cutover = opts.cutoverDate || cfg.legacyCutoverDate;
  const approved = opts.approved === true;
  let pubOT = 0, genOT = 0, worked = 0, incompleteMin = 0, recorded = 0;
  const days = [];

  if (from < cutover) {
    const preTo = to < cutover ? to : addD(cutover, -1);
    const pre = runRange(emp, from, preTo, { ...ctx, cfg: LEGACY_CFG }, approved ? { approved: true } : {});
    const b = bucketPubGen(pre.days, approved);
    pubOT += b.pubMin; genOT += b.genMin;
    worked += pre.worked; incompleteMin += pre.incompleteMin; recorded += pre.recorded;
    days.push(...pre.days);
  }

  if (to >= cutover) {
    const postFrom = from > cutover ? from : cutover;
    const post = runRange(emp, postFrom, to, ctx, approved ? { approved: true } : {});
    // A day imported from HRMS carries that system's OWN weekly-requirement
    // decision already baked in — an entry it left unpaid arrives here as
    // held time, one it paid arrives approved. Re-running our 48h line over
    // it would gate the same hours twice, so imported days are bucketed
    // straight from their claims and only card-derived days are gated.
    const imported = [], gated = [];
    post.days.forEach((d) => (ctx.dayOf?.(emp.no, d.d)?.otFromClaims ? imported : gated).push(d));
    const b = bucketPubGen(imported, approved);
    pubOT += b.pubMin + gated.reduce((s, d) => s + d.pubOT, 0);
    genOT += b.genMin + gated.reduce((s, d) => s + d.genOT, 0);
    worked += post.worked; incompleteMin += post.incompleteMin; recorded += post.recorded;
    days.push(...post.days);
  }

  // Priced at the live rate/multipliers throughout — the question a report
  // answers is what this costs under what we pay now, not a reconstruction
  // of old-era pay rates.
  const rate = rateOf(emp, cfg);
  const weighted = genOT * cfg.generalMult + pubOT * cfg.publicMult;
  return {
    days, genOT, pubOT, otMin: genOT + pubOT, worked, recorded, incompleteMin,
    weighted, amount: (weighted / 60) * rate,
    pct: cfg.monthlyHours > 0 ? (weighted / 60) / cfg.monthlyHours * 100 : 0,
    cutoverDate: cutover,
  };
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
  const whole = eraRange(emp, from, to, ctx, { cutoverDate });
  // The pre/post split the report shows is just the same measurement run
  // over each half, so there is one cutover implementation, not two.
  const pre = from < cutoverDate
    ? eraRange(emp, from, to < cutoverDate ? to : addD(cutoverDate, -1), ctx, { cutoverDate })
    : null;
  const preOtMin = pre ? pre.otMin : 0;
  return {
    preOtMin, postOtMin: whole.otMin - preOtMin, otMin: whole.otMin,
    amount: whole.amount, pct: whole.pct, cutoverDate,
  };
}
