/**
 * Config for the pre-Aug-2026 OT rules, replaced by the 48h weekly-line
 * system this engine otherwise implements. Every mechanism this needs — the
 * weekly line, per-status leave credit, Friday-as-holiday, off-day work
 * counting as full OT — is already parametrized by `cfg` in
 * overtimeEngine.js, so the old rules are just a different `cfg` object run
 * through the exact same `runRange`, not a separate engine. `LEGACY_CFG`
 * itself is report-only — never used for real approvals, never written to a
 * day record.
 *
 * `eraRange()` and `forecast()` are the two functions everything in this
 * module — live screens included, not just reports — should call instead of
 * overtimeEngine.js's own `runRange`: they measure each date under whichever
 * rules actually applied to it, which the plain functions don't. `forecast`
 * lives here rather than in overtimeEngine.js specifically so it can depend
 * on `eraRange` without a circular import (this file already depends on
 * overtimeEngine.js; that dependency doesn't run the other way).
 *
 * `attendanceGraceMin` is pushed absurdly high to neutralise
 * `scheduleMismatch()` — the schedule-vs-attendance absence check is a
 * concept that didn't exist under the old rules, and it has no dedicated
 * on/off switch, but its whole test is `Math.abs(firstIn - schedS) >
 * attendanceGraceMin`, so a large enough grace makes it structurally always
 * false. `holidayMissingPunch` needs no equivalent treatment — it only sets
 * a display flag, never zeroes credit.
 */
import {
  DEF_CFG, runRange, rateOf, addD, range, dow, isHoliday, PROJECTION_SCENARIOS, scenarioMult,
  recordedMin, approvedMinOf, sum,
} from './overtimeEngine';

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
 * Re-buckets one day's own `genOT`/`pubOT` from its `recs`, ungated — for a
 * day whose weekly requirement wasn't the live 48h line at all: an old-rule
 * day (no weekly gate ever applied), or a day imported whole from HRMS
 * (that system already applied ITS OWN weekly decision, so re-gating it
 * against ours would gate the same hours twice). An ordinary post-cutover
 * card day is left untouched — its `genOT`/`pubOT` are runWeek's own,
 * correctly gated against the live 48h line, and re-bucketing here would
 * silently ungate them.
 *
 * Deliberately reads each day's own `recs` rather than `d.otRec`: `otRec` is
 * raw recorded time, which re-includes the unauthorised "Incomplete Working
 * Hours" the live system explicitly does not pay. The pick functions are
 * the engine's own, so this can never drift from what runWeek does.
 */
function rebucket(d, approved) {
  const pick = approved ? approvedMinOf : recordedMin;
  const m = sum(d.recs, pick);
  const isPub = d.holiday || d.status === 'holiday';
  // "Blocked by our 48h line" no longer means anything once this day's pay
  // was decided by HRMS or by rules that never gated weekly at all — leaving
  // the original flag would report OT as held up by a line that was never
  // actually applied to this day.
  return { ...d, genOT: isPub ? 0 : m, pubOT: isPub ? m : 0, blocked: false };
}

/**
 * A range measured under whichever rules actually applied on each date —
 * the old ungated system before `cutoverDate`, the live 48h weekly-line
 * system on and after it — returned in the same shape `runRange` returns
 * (a strict superset: every field runRange has, plus `cutoverDate`) so
 * every consumer of runRange — the projection/estimate, Overview's stat
 * tiles, PDF exports, the roster calendar, everything — can use this
 * instead with no other change, and never disagree with each other over a
 * period that touches old-rule or HRMS-imported data.
 *
 * Every total below is a plain sum over `days` — nothing is computed that
 * isn't sitting on the day object a caller can also render. `rebucket()`
 * above is what makes that true even for old-rule and imported days: it
 * corrects each such day's own `genOT`/`pubOT` once, up front, rather than
 * leaving the totals to separately recompute what the rows would show.
 *
 * This is what any report spanning the changeover should use: measuring a
 * July day under the 48h rules suppresses OT that the old system paid
 * ungated, and measuring an August day under the old rules pays OT the new
 * system gates. A range wholly on one side of the cutover just yields an
 * empty half, so callers never special-case "does this straddle."
 *
 * `opts` is forwarded wholesale to the underlying `runRange` calls (not
 * just `approved`), so `forecast()`'s modelled-future-days `overlay` still
 * works when it switches to this.
 *
 * The post-cutover slice runs through the unmodified live `runRange` so a
 * boundary week keeps its full 48h-line context, exactly as before.
 */
export function eraRange(emp, from, to, ctx, opts = {}) {
  const cfg = ctx.cfg;
  const cutover = opts.cutoverDate || cfg.legacyCutoverDate;
  const approved = opts.approved === true;
  const days = [];
  const rawWeeks = []; // pre/post's own weeks, full 7-day membership preserved

  if (from < cutover) {
    const preTo = to < cutover ? to : addD(cutover, -1);
    const pre = runRange(emp, from, preTo, { ...ctx, cfg: LEGACY_CFG }, opts);
    days.push(...pre.days.map((d) => rebucket(d, approved))); // old rules: never weekly-gated
    rawWeeks.push(...pre.weeks);
  }

  if (to >= cutover) {
    const postFrom = from > cutover ? from : cutover;
    const post = runRange(emp, postFrom, to, ctx, opts);
    days.push(...post.days.map((d) => (
      ctx.dayOf?.(emp.no, d.d)?.otFromClaims ? rebucket(d, approved) : d
    )));
    rawWeeks.push(...post.weeks);
  }

  const genOT = sum(days, (d) => d.genOT);
  const pubOT = sum(days, (d) => d.pubOT);
  const worked = sum(days, (d) => d.credit);
  const incompleteMin = sum(days, (d) => d.incompleteMin);
  const recorded = sum(days, (d) => d.otRec);

  // Priced at the live rate/multipliers throughout — the question a report
  // answers is what this costs under what we pay now, not a reconstruction
  // of old-era pay rates.
  const rate = rateOf(emp, cfg);
  const weighted = genOT * cfg.generalMult + pubOT * cfg.publicMult;

  // Keeps runRange's own full 7-day week membership (a boundary week can
  // include a day or two outside [from, to], there only to complete the
  // row) rather than trimming to in-range days — but swaps in the
  // corrected version of any day this function actually rebucketed, so the
  // calendar/projection views this feeds never show a different genOT for
  // the same date than the flattened `days` above does.
  //
  // The one calendar week straddling the cutover itself gets a `runWeek`
  // entry from BOTH the pre-cutover call (under LEGACY_CFG) and the
  // post-cutover call (under live cfg), which would otherwise duplicate
  // that week in the list — rebuilt by date instead, once per week start,
  // so it appears exactly once regardless of which side(s) produced it.
  const rawDayByDate = new Map();
  rawWeeks.forEach((w) => w.days.forEach((d) => { if (!rawDayByDate.has(d.d)) rawDayByDate.set(d.d, d); }));
  const correctedByDate = new Map(days.map((d) => [d.d, d]));
  const weekStarts = [...new Set(rawWeeks.map((w) => w.start))].sort();
  const weeks = weekStarts.map((start) => {
    const wDays = range(start, addD(start, 6))
      .map((dk) => correctedByDate.get(dk) || rawDayByDate.get(dk))
      .filter(Boolean);
    const total = sum(wDays, (d) => d.credit);
    return { start, days: wDays, total, crossed: total >= cfg.weeklyThresholdMin };
  });

  return {
    days, weeks, genOT, pubOT, otMin: genOT + pubOT, worked, recorded, incompleteMin,
    weighted, amount: (weighted / 60) * rate,
    pct: cfg.monthlyHours > 0 ? (weighted / 60) / cfg.monthlyHours * 100 : 0,
    pending: sum(days, (d) => sum(d.recs.filter((r) => !r.app), (r) => r.min)),
    pendingDays: days.filter((d) => d.recs.some((r) => !r.app)).length,
    pendingRecs: sum(days, (d) => d.recs.filter((r) => !r.app).length),
    openDays: days.filter((d) => d.open).length,
    blockedMin: sum(days, (d) => (d.blocked ? (d.otRec - d.genOT) : 0)),
    cutoverDate: cutover,
  };
}

/** Model the rest of the period from this employee's own observed behaviour,
 *  then re-run the same engine so the 48h line still governs the projection.
 *  `opts.scenario` scales the modelled average for every future day; a value
 *  in `opts.overrides[date]` (minutes) always wins over the scenario model
 *  for that one date — set by a supervisor who knows a specific day won't
 *  follow the average, e.g. from `WeekDetails`.
 *
 *  Lives here, not in overtimeEngine.js, because it has to measure both the
 *  observed past and the modelled future through `eraRange` — the estimate
 *  this exists to produce is exactly what the user relies on to judge a
 *  month with several holidays in it, so it can't quietly use the
 *  non-era-aware `runRange` for any part of the period it covers. */
export function forecast(emp, from, to, asOf, ctx, opts = {}) {
  const clampedAsOf = asOf < from ? from : (asOf > to ? to : asOf);
  const past = range(from, clampedAsOf);
  const actual = eraRange(emp, from, clampedAsOf, ctx, {});
  let genDays = 0, genExtra = 0, holDays = 0, holWork = 0, satDays = 0, satWork = 0;
  actual.days.forEach((d) => {
    if (d.holiday) { holDays++; holWork += d.otRec; } else if (d.dow === 6) { satDays++; satWork += d.otRec; } else if (['work', 'off', 'absent'].includes(d.status)) { genDays++; genExtra += d.otRec; }
  });
  const avgGen = genDays ? genExtra / genDays : 0;
  const avgHol = holDays ? holWork / holDays : 0;
  const avgSat = satDays ? satWork / satDays : 0;

  const scenario = PROJECTION_SCENARIOS[opts.scenario] ? opts.scenario : 'normal';
  const mult = scenarioMult(scenario, ctx.cfg);
  const overrides = opts.overrides || {};

  const overlay = {};
  const dayModel = {};
  const future = range(addD(asOf, 1), to);
  future.forEach((d) => {
    const hol = isHoliday(d, ctx);
    const dd = emp.dutyDays || ctx.cfg.dutyDays;
    let base = 0, status = 'off', type = 'none';
    if (hol) { base = avgHol; status = 'work'; type = 'holiday'; } else if (dow(d) === 6) { base = avgSat; status = 'off'; type = 'sat'; } else if (dd.includes(dow(d))) { base = avgGen; status = 'work'; type = 'gen'; }
    const modelledMin = Math.round(base * mult);
    const overridden = overrides[d] != null;
    const usedMin = overridden ? Math.max(0, Math.round(overrides[d])) : modelledMin;
    overlay[d] = { status, otMin: usedMin, approvedMin: usedMin, approved: true, src: 'forecast' };
    dayModel[d] = { date: d, type, modelledMin, usedMin, overridden };
  });
  const full = eraRange(emp, from, to, ctx, { overlay });
  const elapsed = past.length, total = range(from, to).length;
  return {
    actual, projected: full, elapsed, total,
    confidence: Math.max(0, Math.min(1, elapsed / total)),
    remaining: {
      genDays: future.filter((d) => !isHoliday(d, ctx) && (emp.dutyDays || ctx.cfg.dutyDays).includes(dow(d))).length,
      holDays: future.filter((d) => isHoliday(d, ctx)).length,
      satDays: future.filter((d) => !isHoliday(d, ctx) && dow(d) === 6).length,
    },
    avgGen, avgHol, avgSat, scenario, mult, dayModel,
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
  const days = result.days.map((d) => rebucket(d, false));
  const genMin = sum(days, (d) => d.genOT), pubMin = sum(days, (d) => d.pubOT);
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
