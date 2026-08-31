/**
 * Overtime engine — ported from the overtime-console prototype (see
 * HANDOVER.md). Kept framework-free and pure: every function takes the
 * pieces of state it needs as arguments instead of reaching into a global,
 * so it can be unit-tested in isolation and reused from React without a
 * manual cache to invalidate.
 *
 * A `ctx` bundles the read-only inputs a calculation needs:
 *   { cfg, holidays, dayOf(personNo, dateKey) }
 * `dayOf` returns the raw day record for that person/date, or undefined —
 * the caller (a repo-backed hook) is responsible for building that lookup.
 */

/* ---------------------------- defaults ---------------------------- */

export const DEF_CFG = {
  weeklyThresholdMin: 48 * 60,   // OT starts only after this many credited hours in the week
  dutyStart: '08:00', dutyEnd: '15:00',
  dutyDays: [0, 1, 2, 3, 4],        // Sun..Thu
  shiftStarts: ['00:00', '08:00', '16:00'],
  shiftMin: 480, handoverMin: 30, earlyGraceMin: 30,
  weeklyRequiredMin: 35 * 60,
  annualCreditMin: 480,          // annual leave credits 8h toward the 48
  casualCreditMin: 0, frlCreditMin: 0,
  publicMult: 1.5, generalMult: 1.25,
  monthlyHours: 154,             // fixed hours a full month of basic salary buys
  dutyPastLine: true,            // once the line is passed, further rostered hours are overtime too
  fridayIsHoliday: true,
  currency: 'MVR',
  alertPct: 50,                  // projected OT past this share of basic surfaces a dashboard alert
  // How much harder future days are modelled to run than this person's own
  // average, for the "Extended hours"/"Extreme (overhaul)" projection
  // scenarios — "Normal" is always the plain average (×1), not editable,
  // since it's meant to reflect actual observed behaviour. Adjustable from
  // the Rules screen instead of asking for a code change each time reality
  // shifts (an overhaul period runs later than normal times, for instance).
  scenarioMultipliers: { extended: 1.3, extreme: 1.6 },
  defaultScenario: 'normal',    // the Overview-wide default every staff member follows unless overridden
};

/** Maldives public holidays — seeded as the config record's starting point,
 *  editable from the Rules/Calendar screen. Islamic dates shift with moon
 *  sighting and must be checked against the government gazette each period
 *  (HANDOVER.md §8c); Fridays are handled separately by fridayIsHoliday. */
export const SEED_HOLIDAYS = [
  ['2026-01-01', "New Year's Day"], ['2026-02-05', 'Public Holiday'],
  ['2026-02-19', 'First of Ramazan'], ['2026-03-20', 'Eid-ul Fithr'],
  ['2026-03-21', 'Eid-ul Fithr holiday'], ['2026-03-22', 'Eid-ul Fithr holiday'],
  ['2026-05-01', "Worker's Day"], ['2026-05-27', 'Hajj Day'], ['2026-05-28', "Eid-ul Al'haa"],
  ['2026-05-29', "Eid-ul Al'haa holiday"], ['2026-05-30', "Eid-ul Al'haa holiday"],
  ['2026-06-16', 'Islamic New Year'], ['2026-07-26', 'Independence Day'],
  ['2026-08-15', 'Qaumee Dhuvas'], ['2026-08-25', 'Mawlid al-Nabi'],
  ['2026-09-13', 'The Day Maldives Embraced Islam'],
  ['2026-11-03', 'Victory Day'], ['2026-11-11', 'Republic Day'],
  ['2027-01-01', "New Year's Day"],
];

export const STATUS = {
  work: { label: 'Working', credit: 'worked' },
  off: { label: 'Off / rest day', credit: 'zero' },
  annual: { label: 'Annual leave', credit: 'annual' },
  casual: { label: 'Casual leave', credit: 'casual' },
  frl: { label: 'Family responsibility (FRL)', credit: 'frl' },
  sick: { label: 'Sick leave', credit: 'casual' },
  absent: { label: 'Absent', credit: 'zero' },
  holiday: { label: 'Public holiday', credit: 'worked' },
};

/* ---------------------------- dates ---------------------------- */
/* All date keys are YYYY-MM-DD, local calendar dates, no timezone exposure. */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const tmin = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const fmtT = (m) => { const n = (((Math.round(m) % 1440) + 1440) % 1440); return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };
export const dparse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const dkey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const dow = (k) => dparse(k).getDay(); // 0 Sun .. 6 Sat
export const addD = (k, n) => { const d = dparse(k); d.setDate(d.getDate() + n); return dkey(d); };
export const daysBetween = (a, b) => Math.round((dparse(b) - dparse(a)) / 86400000);
export const range = (a, b) => { const o = []; let c = a; let guard = 0; while (c <= b && guard++ < 2000) { o.push(c); c = addD(c, 1); } return o; };
export const weekStart = (k) => addD(k, -dow(k)); // Sunday on/before

/** Salary period: 16th of month -> 15th of next month. */
export function periodFor(k) {
  const d = dparse(k);
  let y = d.getFullYear(), m = d.getMonth();
  if (d.getDate() < 16) { m -= 1; if (m < 0) { m = 11; y -= 1; } }
  const s = new Date(y, m, 16), e = new Date(y, m + 1, 15);
  return { from: dkey(s), to: dkey(e), label: `${MON[s.getMonth()]} 16 – ${MON[e.getMonth()]} 15, ${e.getFullYear()}` };
}
export function periodShift(p, n) { return periodFor(addD(p.from, n * 31)); }

/* ---------------------------- formatting ---------------------------- */

export const hm = (m) => { m = Math.round(m || 0); const s = m < 0 ? '-' : ''; m = Math.abs(m); return `${s}${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
/** Decimal-hours headline figure, e.g. 448.1 for a stat tile's big number. */
export const hDec = (m) => (Math.round((m || 0) / 6) / 10).toFixed(1);
export const toHHMM = (m) => { m = Math.max(0, Math.round(m || 0)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
export const fromHHMM = (v) => {
  const s = String(v == null ? '' : v).trim();
  if (/^\d{1,3}:\d{1,2}$/.test(s)) { const [a, b] = s.split(':').map(Number); return a * 60 + Math.min(59, b); }
  const n = parseFloat(s); return Number.isNaN(n) ? 0 : Math.round(n);
};
export const money = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sum = (a, f) => a.reduce((t, x) => t + (f ? f(x) : x), 0);

/* ---------------------------- holidays & pay ---------------------------- */

/** A holidays-map value is either a legacy plain name string (always a
 *  public holiday) or `{ name, kind }` where kind is 'public' or 'off'. An
 *  "off" day behaves like a Saturday — not a scheduled duty day, but not
 *  automatically overtime either — unlike a public holiday, where every
 *  hour worked is paid overtime regardless of the 48h line. */
export function normalizeHoliday(value) {
  if (!value) return null;
  return typeof value === 'string' ? { name: value, kind: 'public' } : value;
}
export function isHoliday(d, ctx) {
  const h = normalizeHoliday(ctx.holidays && ctx.holidays[d]);
  return (!!h && h.kind !== 'off') || (ctx.cfg.fridayIsHoliday && dow(d) === 5);
}
/** True for a declared "off" day — see normalizeHoliday above. */
export function isOffHoliday(d, ctx) {
  const h = normalizeHoliday(ctx.holidays && ctx.holidays[d]);
  return !!(h && h.kind === 'off');
}
export function holidayName(d, ctx) {
  const h = normalizeHoliday(ctx.holidays && ctx.holidays[d]);
  return (h && h.name) || (ctx.cfg.fridayIsHoliday && dow(d) === 5 ? 'Friday' : null);
}

/** Pay is anchored to the monthly basic salary: an hour of basic is
 *  basic / monthlyHours, and overtime is that hour at 1.25x or 1.5x. */
export function rateOf(emp, cfg) {
  const basic = (emp && emp.basic) || 0;
  return cfg.monthlyHours > 0 ? basic / cfg.monthlyHours : 0;
}

/* ---------------------------- day access ---------------------------- */

/** The stored day record for a person/date, or the roster-implied default
 *  when nothing has been recorded yet. */
export function getDay(emp, d, ctx) {
  const r = ctx.dayOf(emp.no, d);
  if (r) return r;
  const isDuty = (emp.dutyDays || ctx.cfg.dutyDays).includes(dow(d)) && !isHoliday(d, ctx) && !isOffHoliday(d, ctx);
  return { status: isDuty ? 'work' : 'off', otMin: 0, approvedMin: 0, approved: false, note: '', src: '' };
}

/** Each day holds a list of overtime entries. Odd-hour call-outs are separate
 *  entries so they can be approved on their own, but once approved they
 *  simply add into the day's total worked time. */
export function classify(emp, d, r, ctx) {
  if (!r || !r.s) return 'shift';
  const t = (x) => { const [h, m] = x.split(':').map(Number); return h * 60 + (m || 0); };
  const st = t(r.s);
  if (st >= 22 * 60 || st < 6 * 60) return 'callout';
  const dd = (emp && emp.dutyDays) || ctx.cfg.dutyDays;
  if (!isHoliday(d, ctx) && !isOffHoliday(d, ctx) && dd.includes(dow(d))) {
    const ds = t(ctx.cfg.dutyStart), de = t(ctx.cfg.dutyEnd);
    if (st < ds - 30 || st > de + 60) return 'callout';
  }
  return 'shift';
}

export function normRecs(emp, d, raw, ctx) {
  if (!raw) return [];
  let base;
  const A = raw.appr || {};
  if (raw.sessions) { // derived from card punches
    const f = dayFacts(emp, d, raw, ctx);
    base = f.recs.map((r) => { const a = A[r.id] || {}; return { ...r, appMin: a.appMin != null ? a.appMin : r.min, app: !!a.app, note: a.note || '' }; });
  } else {
    const list = (Array.isArray(raw.recs) && raw.recs.length) ? raw.recs
      : (raw.otMin > 0 ? [{ s: raw.s || '', e: raw.e || '', min: raw.otMin }] : []);
    base = list.map((x, i) => {
      const a = A[x.id || `r${i}`] || {};
      return {
        id: x.id || (`r${i}`), s: x.s || '', e: x.e || '', min: x.min || 0,
        appMin: x.appMin != null ? x.appMin : (x.min || 0),
        app: x.app != null ? !!x.app : !!raw.approved,
        kind: x.kind || classify(emp, d, x, ctx),
        note: a.note || '',
      };
    });
  }
  // Hand-added entries (a supervisor filling in something the import
  // missed) always layer on top, whichever branch above ran — they're kept
  // separate from `sessions`/`recs` so adding one never disturbs whatever
  // was actually imported for that day.
  const manual = Array.isArray(raw.manualRecs) ? raw.manualRecs.map((x, i) => {
    const a = A[x.id] || {};
    return {
      id: x.id || `man${i}`, s: x.s || '', e: x.e || '', min: x.min || 0,
      appMin: a.appMin != null ? a.appMin : (x.appMin != null ? x.appMin : (x.min || 0)),
      app: !!a.app,
      kind: x.kind || 'manual',
      note: a.note != null ? a.note : (x.note || ''),
    };
  }) : [];
  return [...base, ...manual];
}

/* ---- shift staff -------------------------------------------------------
   Duty staff run 00:00 / 08:00 / 16:00 shifts of 8h, plus 30 minutes of
   handover, so a normal shift is 8h30. They may card in up to 30 minutes
   early; those minutes are not worked time, so an entry that starts before
   its shift is clipped forward to the shift start. */
export function shiftPart(emp, d, r, min, cfg) {
  const m = min != null ? min : r.min;
  if (!r.s) return { kind: r.kind === 'callout' ? 'callout' : 'shift', counted: m, clipped: 0, shiftStart: null };
  const t = tmin(r.s);
  let best = null;
  (cfg.shiftStarts || []).forEach((ss) => {
    const b = tmin(ss);
    [b - 1440, b, b + 1440].forEach((c) => { const diff = t - c; if (!best || Math.abs(diff) < Math.abs(best.diff)) best = { c, diff }; });
  });
  if (!best) return { kind: 'callout', counted: m, clipped: 0, shiftStart: null };
  const diff = best.diff;
  if (m >= cfg.shiftMin * 0.5 && diff >= -cfg.earlyGraceMin && diff <= 90) {
    return { kind: 'shift', counted: Math.max(0, m + Math.min(0, diff)), clipped: diff < 0 ? -diff : 0, shiftStart: fmtT(best.c) };
  }
  if (Math.abs(diff) <= 5 && m < cfg.shiftMin * 0.5) {
    return { kind: 'handover', counted: m, clipped: 0, shiftStart: fmtT(best.c) };
  }
  return { kind: 'callout', counted: m, clipped: 0, shiftStart: null };
}

/** Worked minutes and extra minutes for one day, for either kind of staff.
 *  `pick` decides whether an entry counts at its recorded or approved length. */
export function analyseDay(emp, d, recs, sched, pick, raw, ctx) {
  const cfg = ctx.cfg;
  if (raw && raw.sessions) {
    // the entries already are the extra time, measured off the card punches
    const extra = sum(recs, pick);
    return { counted: sched + extra, extra, ov: 0, hasShift: !!sched, clipped: 0, parts: recs.map((r) => ({ ...r, counted: pick(r) })) };
  }
  if (emp.staffType !== 'duty') {
    // maintenance: on a normal duty day the clock starts at 08:00, so any part
    // of an entry inside the duty window is already paid and does not count again
    const eff = sum(recs, pick);
    const ov = sched > 0 ? Math.min(eff, sum(recs, (r) => overlapDuty(emp, d, r, ctx))) : 0;
    return { counted: sched + Math.max(0, eff - ov), extra: Math.max(0, eff - ov), ov, hasShift: false, clipped: 0, parts: recs.map((r) => ({ ...r, counted: pick(r) })) };
  }
  let shiftM = 0, tailM = 0, callM = 0, clipped = 0, hasShift = false;
  const parts = recs.map((r) => {
    const a = shiftPart(emp, d, r, pick(r), cfg);
    if (a.kind === 'shift') { hasShift = true; shiftM += a.counted; clipped += a.clipped; }
    else if (a.kind === 'handover') tailM += a.counted;
    else callM += a.counted;
    return { ...r, ...a };
  });
  const tailExtra = Math.max(0, tailM - cfg.handoverMin);
  // when only a handover tail was logged, the shift itself is the roster's
  const counted = hasShift ? (shiftM + tailM + callM) : (sched + tailExtra + callM);
  return { counted, extra: Math.max(0, counted - sched), ov: 0, hasShift, clipped, parts };
}

/** Duty minutes scheduled for an employee on a date. */
export function dutyMinFor(emp, d, ctx) {
  const raw = ctx.dayOf(emp.no, d);
  if (raw && raw.sessions) { // measured, not assumed
    const f = dayFacts(emp, d, raw, ctx);
    return f ? f.normalMin : 0;
  }
  if (isHoliday(d, ctx) || isOffHoliday(d, ctx)) return 0;
  const dd = emp.dutyDays || ctx.cfg.dutyDays;
  return dd.includes(dow(d)) ? (emp.dutyMin || 420) : 0;
}

/** Minutes of an OT record that overlap the normal duty window (double counting guard). */
export function overlapDuty(emp, d, rec, ctx) {
  if (!rec || !rec.s || !rec.e) return 0;
  if (isHoliday(d, ctx) || isOffHoliday(d, ctx)) return 0;
  const dd = emp.dutyDays || ctx.cfg.dutyDays;
  if (!dd.includes(dow(d))) return 0;
  const t = (x) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; };
  const ds = t(ctx.cfg.dutyStart), de = t(ctx.cfg.dutyEnd);
  let a = t(rec.s), b = t(rec.e); if (b < a) b += 1440;
  return Math.max(0, Math.min(b, de) - Math.max(a, ds));
}

/* ---- derived facts for one day ----------------------------------------
   Pure function, memoised by the caller (a useMemo keyed on the day
   record's updatedAt) instead of a manual cache — see HANDOVER.md's note
   that FACT_CACHE/bump() was the sharpest edge in the source prototype. */
export function dayFacts(emp, d, raw, ctx) {
  if (!raw || !raw.sessions) return null;
  const cfg = ctx.cfg, hol = isHoliday(d, ctx), off = isOffHoliday(d, ctx), st = raw.status || 'work';
  const hasSch = st === 'work' && !!raw.schedS;
  const ns = hasSch ? tmin(raw.schedS) * 60 : null;
  let ne = null;
  if (hasSch) { let e = tmin(raw.schedE) * 60; if (e <= ns) e += 86400; ne = e + (emp.staffType === 'duty' ? cfg.handoverMin * 60 : 0); }
  const countNormal = hasSch && !hol && !off;
  let normal = 0, open = false;
  const recs = [], unknown = [];
  (raw.sessions || []).forEach((s, i) => {
    let a = s.i, b;
    if (s.o != null) { b = s.o; if (b < a) b += 86400; } else {
      // No check-out. Assume the rostered end only when it actually lies ahead
      // of the card-in; otherwise the session runs past the data we hold, so
      // claim nothing and flag it rather than inventing a shift.
      open = true;
      b = (ne != null && ne > a) ? ne : null;
      if (b == null) { unknown.push({ id: `u${i}`, cardIn: fmtT(Math.round(a / 60)) }); return; }
    }
    const start = hasSch ? Math.max(a, ns) : a;
    let from;
    if (countNormal) { normal += Math.max(0, Math.min(b, ne) - Math.max(a, ns)); from = Math.max(start, ne); } else from = start;
    const ex = Math.max(0, b - from);
    if (ex >= 60) {
      recs.push({
        id: `s${i}`, s: fmtT(Math.round(from / 60)), e: fmtT(Math.round(b / 60)),
        min: Math.floor(ex / 60), open: s.open,
        kind: countNormal ? (a > ne ? 'callout' : 'extension') : (hol ? 'holiday' : 'dayoff'),
        cardIn: fmtT(Math.round(a / 60)), clipped: hasSch ? Math.max(0, Math.round((ns - a) / 60)) : 0,
      });
    }
  });
  return { normalMin: Math.floor(normal / 60), recs, hasSch, open, unknown, countNormal, ns, ne };
}

/* ============================================================
   THE ENGINE
   Walks Sun -> Sat. Hours accumulate against a 48h weekly line.
   Friday / public-holiday hours are always OT and still count
   toward the line, so they can push later days over it.
   ============================================================ */
export function runWeek(emp, weekStartKey, ctx, opts = {}) {
  const cfg = ctx.cfg, out = [], useApproved = opts.approved === true;
  let cum = 0;
  for (let i = 0; i < 7; i++) {
    const d = addD(weekStartKey, i);
    const rec = opts.overlay && opts.overlay[d] ? opts.overlay[d] : getDay(emp, d, ctx);
    const recs = normRecs(emp, d, rec, ctx);
    const hol = isHoliday(d, ctx);
    const st = hol && rec.status === 'work' ? 'holiday' : rec.status;
    const duty = (st === 'work') ? dutyMinFor(emp, d, ctx) : 0;
    const fx = rec.sessions ? dayFacts(emp, d, rec, ctx) : null;
    const openDay = !!(fx && fx.unknown && fx.unknown.length);
    const openIn = openDay ? fx.unknown.map((u) => u.cardIn) : [];

    const otRec = sum(recs, (r) => r.min); // as recorded
    const pickEff = (r) => (r.app ? Math.min(r.appMin, r.min) : r.min);
    const pickApp = (r) => (r.app ? Math.min(r.appMin, r.min) : 0);
    const appr = sum(recs, pickApp);

    // an approved entry counts at its approved length, so trimming an entry
    // shortens both the pay and the hours credited toward the 48h line
    const A = analyseDay(emp, d, recs, duty, pickEff, rec, ctx);
    const Ap = analyseDay(emp, d, recs, duty, pickApp, rec, ctx);
    const eff = A.counted, extra = A.extra;

    let credit = 0;
    if (st === 'annual') credit = cfg.annualCreditMin;
    else if (st === 'casual' || st === 'sick') credit = cfg.casualCreditMin;
    else if (st === 'frl') credit = cfg.frlCreditMin;
    else credit = duty + (useApproved ? Ap.extra : extra); // off-day work still counts

    // once the weekly line is passed, rostered hours count as overtime too;
    // extra time always needs an approved entry behind it
    const working = st === 'work' || st === 'holiday' || (st !== 'annual' && st !== 'casual' && st !== 'frl' && st !== 'sick' && extra > 0);
    const poolAll = !working ? 0 : (cfg.dutyPastLine ? duty + extra : extra);
    const poolApp = !working ? 0 : (cfg.dutyPastLine ? duty + Ap.extra : Ap.extra);
    const pool = useApproved ? poolApp : poolAll;

    const before = cum; cum += credit;

    let genOT = 0, pubOT = 0, gate = 0;
    if (hol || st === 'holiday') {
      pubOT = pool; // always OT, regardless of the line
    } else {
      const beyond = Math.max(0, cum - cfg.weeklyThresholdMin) - Math.max(0, before - cfg.weeklyThresholdMin);
      gate = beyond;
      genOT = Math.min(beyond, pool);
    }
    out.push({
      d, dow: dow(d), status: st, holiday: hol, holidayName: holidayName(d, ctx), isOff: isOffHoliday(d, ctx), recs,
      parts: A.parts, hasShift: A.hasShift, clipped: A.clipped, open: openDay, openIn,
      schedS: rec.schedS || null, schedE: rec.schedE || null, fromPunches: !!rec.sessions,
      duty, otRec, effMin: eff, approvedMin: appr,
      approved: recs.length > 0 && recs.every((r) => r.app),
      partly: recs.some((r) => r.app) && recs.some((r) => !r.app),
      callouts: recs.filter((r) => r.kind === 'callout').length,
      extra, credit,
      cumBefore: before, cumAfter: cum, genOT, pubOT, gate,
      blocked: !hol && pool > 0 && genOT < pool, // OT recorded but under the line
      note: rec.note || '', src: rec.src || '',
    });
  }
  return { start: weekStartKey, days: out, total: cum, crossed: cum >= ctx.cfg.weeklyThresholdMin };
}

export function runRange(emp, from, to, ctx, opts = {}) {
  const weeks = [];
  let w = weekStart(from), guard = 0;
  while (w <= to && guard++ < 200) { weeks.push(runWeek(emp, w, ctx, opts)); w = addD(w, 7); }
  const inRange = [];
  weeks.forEach((wk) => wk.days.forEach((d) => { if (d.d >= from && d.d <= to) inRange.push(d); }));
  const rate = rateOf(emp, ctx.cfg), cfg = ctx.cfg;
  const genOT = sum(inRange, (d) => d.genOT), pubOT = sum(inRange, (d) => d.pubOT);
  const worked = sum(inRange, (d) => d.credit);
  // weighted minutes are what actually gets paid: general at 1.25x, holiday at 1.5x
  const weighted = genOT * cfg.generalMult + pubOT * cfg.publicMult;
  const amt = (weighted / 60) * rate;
  return {
    weeks, days: inRange, genOT, pubOT, otMin: genOT + pubOT, worked,
    weighted, amount: amt,
    // the overtime percentage: weighted hours against the fixed monthly hours,
    // which is exactly the share of basic salary that will be paid out
    pct: cfg.monthlyHours > 0 ? (weighted / 60) / cfg.monthlyHours * 100 : 0,
    pending: sum(inRange, (d) => sum(d.recs.filter((r) => !r.app), (r) => r.min)),
    pendingDays: inRange.filter((d) => d.recs.some((r) => !r.app)).length,
    pendingRecs: sum(inRange, (d) => d.recs.filter((r) => !r.app).length),
    recorded: sum(inRange, (d) => d.otRec),
    openDays: inRange.filter((d) => d.open).length,
    blockedMin: sum(inRange, (d) => (d.blocked ? (d.otRec - d.genOT) : 0)),
  };
}

/** A few preset "how hard is work biting right now" labels applied to this
 *  person's own observed daily averages before modelling future days — e.g.
 *  an engine-overhaul period runs later every day than normal times, so a
 *  single fixed average badly under- or over-states the rest of the period.
 *  `normal` always reproduces the plain historical-average projection (×1,
 *  not configurable — it's meant to track reality, not be tuned); the other
 *  two multipliers live in `cfg.scenarioMultipliers`, editable from the
 *  Rules screen instead of a hardcoded guess. */
export const PROJECTION_SCENARIOS = {
  normal: { label: 'Normal' },
  extended: { label: 'Extended hours' },
  extreme: { label: 'Extreme (overhaul)' },
};

export function scenarioMult(scenario, cfg) {
  if (scenario === 'normal') return 1;
  const m = (cfg.scenarioMultipliers || DEF_CFG.scenarioMultipliers)[scenario];
  return m != null ? m : DEF_CFG.scenarioMultipliers[scenario];
}

/** Model the rest of the period from this employee's own observed behaviour,
 *  then re-run the same engine so the 48h line still governs the projection.
 *  `opts.scenario` scales the modelled average for every future day; a value
 *  in `opts.overrides[date]` (minutes) always wins over the scenario model
 *  for that one date — set by a supervisor who knows a specific day won't
 *  follow the average, e.g. from `WeekDetails`. */
export function forecast(emp, from, to, asOf, ctx, opts = {}) {
  const clampedAsOf = asOf < from ? from : (asOf > to ? to : asOf);
  const past = range(from, clampedAsOf);
  const actual = runRange(emp, from, clampedAsOf, ctx, {});
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
  const full = runRange(emp, from, to, ctx, { overlay });
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

/** Scheduled duty minutes in a range — the denominator for the OT percentage. */
export function scheduledMin(emp, from, to, ctx) {
  return sum(range(from, to), (d) => dutyMinFor(emp, d, ctx));
}

export const LEAVE_CODE = { annual: 'AL', casual: 'CL', frl: 'FRL', sick: 'SL' };

/** Whether a roster day is one this person is nominally rostered to work —
 *  independent of whether any record exists yet. */
export function isDutyDay(day, emp, cfg) {
  return !day.holiday && !day.isOff && (emp.dutyDays || cfg.dutyDays).includes(day.dow);
}

/** Classifies one `runWeek`/`runRange` day into an attendance label for the
 *  read-only calendar and week views — an approximation of an HRMS roster
 *  calendar's status column, not a literal port (there's no "Late" concept
 *  in this data model, so it's dropped). `hasRecord` is whether any
 *  `overtime.day` record exists at all for this date — the caller passes
 *  `!!ctx.dayOf(emp.no, day.d)` — since a day can carry a real decision
 *  (an explicit status, or attendance) without necessarily having session
 *  punches (`fromPunches`).
 *
 *  A past/today duty day with no record and no explicit status is labelled
 *  "No record" rather than "Absent" — the data simply hasn't been entered
 *  yet, which isn't the same as knowing the person didn't show up. */
export function attendanceLabel(day, emp, cfg, hasRecord, todayKey) {
  if (LEAVE_CODE[day.status]) return { key: 'leave', label: `Leave: ${LEAVE_CODE[day.status]}` };
  if (day.status === 'absent') return { key: 'absent', label: 'Absent' };

  const dutyDay = isDutyDay(day, emp, cfg);
  if (hasRecord && (day.fromPunches || day.otRec > 0)) {
    return dutyDay ? { key: 'present', label: 'Present' } : { key: 'attended', label: 'Attended' };
  }
  if (!dutyDay) return { key: 'offDuty', label: 'Off duty' };
  if (day.d > todayKey) return { key: 'scheduled', label: 'Scheduled' };
  return { key: 'noRecord', label: 'No record' };
}
