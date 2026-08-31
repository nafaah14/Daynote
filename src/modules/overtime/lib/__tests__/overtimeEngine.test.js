/**
 * Regression suite pinned to the reconciliation figures verified in
 * HANDOVER.md §6 against the client's real HRMS output. The fixture data
 * below (SEED_ATT/SEED_CSV rows) is the prototype's own seed data, copied
 * verbatim — not synthetic — for the two staff the handover doc names:
 * Mohamed Salah (120076, maintenance) and Ahmed Sinaz (110130, duty/shift).
 *
 * If a future change to overtimeEngine.js or attendanceImport.js breaks any
 * of these, it changed something the client's payroll depends on — treat
 * that as a stop-and-investigate signal, not a fixture to update.
 */
import { describe, it, expect } from 'vitest';
import {
  DEF_CFG, runWeek, runRange, weekStart, isHoliday, isOffHoliday, forecast, attendanceLabel,
  derivePunches, punchLog, pairPunches, effectiveSessions, dayFacts,
} from '../overtimeEngine';
import { parseCompactAttendance, attendanceToDays, buildSessions, detectDuty } from '../attendanceImport';

const YEAR = '2026';

// Mohamed Salah, employee 120076 — maintenance staff, 08:00-15:00 office day.
const SALAH_ATT = `120076;0816;P;080000-150000;I074705,O190448
120076;0817;P;080000-150000;I074443,O193229
120076;0818;P;080000-150000;I074125,O181347,I212111
120076;0819;P;080000-150000;O005141,I073558,O172145
120076;0820;P;080000-150000;I075137,I075144,O173944
120076;0821;O;080000-150000;I052850,O084857
120076;0822;O;080000-150000;I073601,O174320
120076;0823;P;080000-150000;I073659,O184143
120076;0824;P;080000-150000;I073449,O190514,O190517
120076;0825;O;080000-150000;
120076;0826;P;080000-150000;I073524,O184540
120076;0827;P;080000-150000;I073342,O182037
120076;0828;O;080000-150000;I073010,O180434`;

// Ahmed Sinaz, employee 110130 — duty/shift staff, rotating 00:00/08:00/16:00.
const SINAZ_ATT = `110130;0816;P;160000-000000;I153458
110130;0817;P;160000-000000;O003253,O003407,I154437
110130;0818;X;080000-160000;O003336,O003834
110130;0819;P;080000-160000;I074225,O163113,I234320,I234332
110130;0820;P;000000-080000;O083240,O083243,I234012,I234023
110130;0821;P;000000-080000;O083350
110130;0822;P;160000-000000;I155105,I155106
110130;0823;P;160000-000000;O003216,I153102,I153109
110130;0824;X;080000-160000;O001815
110130;0825;P;080000-160000;I073252,I073259,O173356,I235031
110130;0826;P;000000-080000;O081104,I233826
110130;0827;P;000000-080000;O082236
110130;0828;P;160000-000000;I155629,I155637`;

// Only holiday inside the sample window (16-28 Aug); Fridays (Aug 21, 28) are
// handled by cfg.fridayIsHoliday, not this list.
const HOLIDAYS = { '2026-08-25': 'Mawlid al-Nabi' };

function ctxFor(daysByDate) {
  return { cfg: DEF_CFG, holidays: HOLIDAYS, dayOf: (no, d) => daysByDate[d] };
}

function loadEmployee(attText, basic) {
  const [att] = parseCompactAttendance(attText, YEAR);
  const built = attendanceToDays(att, DEF_CFG);
  const emp = {
    no: built.no, name: 'test', dept: '', unit: '',
    staffType: built.staffType, dutyMin: built.staffType === 'duty' ? DEF_CFG.shiftMin + DEF_CFG.handoverMin : 420,
    dutyDays: [...DEF_CFG.dutyDays], basic, active: true,
  };
  return { emp, ctx: ctxFor(built.days) };
}

describe('attendanceImport: staff type detection', () => {
  it('recognises Mohamed Salah as maintenance staff (single 08:00-15:00 window)', () => {
    const [att] = parseCompactAttendance(SALAH_ATT, YEAR);
    expect(detectDuty(att, DEF_CFG)).toBe(false);
  });

  it('recognises Ahmed Sinaz as duty staff (rotating shift windows)', () => {
    const [att] = parseCompactAttendance(SINAZ_ATT, YEAR);
    expect(detectDuty(att, DEF_CFG)).toBe(true);
  });
});

describe('attendanceImport: buildSessions — the overnight cases everything else depends on', () => {
  it('files an early card-in for a 00:00 shift under the previous evening (23:43, negative offset)', () => {
    const [att] = parseCompactAttendance(SINAZ_ATT, YEAR);
    const byDay = buildSessions(att);
    // the 00:00 shift on 2026-08-20 was carded in at 23:43:20 the evening before
    const day20 = byDay['2026-08-20'] || [];
    const early = day20.find((s) => s.i < 0);
    expect(early).toBeTruthy();
    expect(early.i).toBe(-1000); // 23:43:20 -> -(24:00:00 - 23:43:20) = -1000s
  });

  it("files Sinaz's Saturday 22 Aug card-in at its raw time (16:00 clipping is shiftPart's job, not buildSessions')", () => {
    const [att] = parseCompactAttendance(SINAZ_ATT, YEAR);
    const byDay = buildSessions(att);
    const day22 = byDay['2026-08-22'] || [];
    expect(day22.length).toBeGreaterThan(0);
    const start = Math.min(...day22.map((s) => s.i));
    // raw card-in 15:51:05 — buildSessions never clips to the shift start
    expect(start).toBe(15 * 3600 + 51 * 60 + 5);
  });
});

describe('overtimeEngine: the approval-ask vs payable-OT worked example (HANDOVER.md §2.3)', () => {
  it('Thu 20 Aug: asks approval for 15:00-17:39 but pays 7h19 once the 48h line is crossed mid-day', () => {
    const { emp, ctx } = loadEmployee(SALAH_ATT, 14800);
    const week = runWeek(emp, weekStart('2026-08-20'), ctx);
    const day = week.days.find((d) => d.d === '2026-08-20');
    expect(day.recs).toHaveLength(1);
    expect(day.recs[0].s).toBe('15:00');
    // the actual card-out is 17:39:44; the display label rounds to the
    // nearest minute (17:40) while the payable duration below is floored
    // from the exact second count, which is where HANDOVER.md's "2h39" comes from
    expect(day.recs[0].e).toBe('17:40');
    expect(day.extra).toBe(159); // 2h39 — the approval ask
    expect(day.genOT).toBe(439); // 7h19 — the payable overtime, including rostered hours past the line
  });
});

describe('overtimeEngine: "off" days behave like a Saturday, not a public holiday', () => {
  it("isn't a holiday, isn't scheduled duty, and its worked hours land in general OT, not holiday OT", () => {
    const [att] = parseCompactAttendance(SALAH_ATT, YEAR);
    const built = attendanceToDays(att, DEF_CFG);
    const emp = { no: built.no, name: 'test', staffType: 'maintenance', dutyMin: 420, dutyDays: [...DEF_CFG.dutyDays], basic: 14800, active: true };
    // 2026-08-24 is an ordinary Monday with real attendance in the fixture —
    // declare it a one-off "off" day, distinct from a real public holiday.
    const offCtx = { cfg: DEF_CFG, holidays: { '2026-08-24': { name: 'Company off day', kind: 'off' } }, dayOf: (no, d) => built.days[d] };

    expect(isHoliday('2026-08-24', offCtx)).toBe(false);
    expect(isOffHoliday('2026-08-24', offCtx)).toBe(true);

    const week = runWeek(emp, weekStart('2026-08-24'), offCtx);
    const day = week.days.find((d) => d.d === '2026-08-24');
    expect(day.holiday).toBe(false);
    expect(day.duty).toBe(0); // not counted as a scheduled duty day, same as a Saturday
    expect(day.extra).toBe(665); // the whole card-in-to-card-out span, clipped to the 08:00 start
    expect(day.pubOT).toBe(0); // never holiday-rate OT, unlike a real public holiday
  });
});

describe('overtimeEngine: forecast scenarios and per-day overrides', () => {
  it('scales every future-day estimate by the scenario multiplier, and a per-day override wins over it', () => {
    const { emp, ctx } = loadEmployee(SALAH_ATT, 14800);
    const asOf = '2026-08-22'; // leaves 23-28 Aug as the modelled tail

    const normal = forecast(emp, '2026-08-16', '2026-08-28', asOf, ctx, { scenario: 'normal' });
    const extreme = forecast(emp, '2026-08-16', '2026-08-28', asOf, ctx, { scenario: 'extreme' });
    expect(extreme.mult).toBeCloseTo(1.6, 5);

    // same day type ('gen'), same base average, only the multiplier differs
    const genDay = Object.keys(normal.dayModel).find((d) => normal.dayModel[d].type === 'gen');
    expect(genDay).toBeTruthy();
    expect(normal.dayModel[genDay].modelledMin).toBeGreaterThan(0);
    expect(extreme.dayModel[genDay].modelledMin).toBe(Math.round(normal.dayModel[genDay].modelledMin * 1.6));
    expect(extreme.projected.otMin).toBeGreaterThan(normal.projected.otMin);

    // a hand-set override for one date beats the scenario model, and the
    // resulting day's recorded overtime matches exactly what was set
    const overridden = forecast(emp, '2026-08-16', '2026-08-28', asOf, ctx, {
      scenario: 'extreme', overrides: { [genDay]: 999 },
    });
    expect(overridden.dayModel[genDay].overridden).toBe(true);
    expect(overridden.dayModel[genDay].usedMin).toBe(999);
    const day = overridden.projected.days.find((d) => d.d === genDay);
    expect(day.otRec).toBe(999);
  });

  it("reads the extended/extreme multipliers from cfg.scenarioMultipliers, not a hardcoded constant", () => {
    const { emp, ctx } = loadEmployee(SALAH_ATT, 14800);
    const asOf = '2026-08-22';
    const customCtx = { ...ctx, cfg: { ...ctx.cfg, scenarioMultipliers: { extended: 2, extreme: 3 } } };

    const extended = forecast(emp, '2026-08-16', '2026-08-28', asOf, customCtx, { scenario: 'extended' });
    const extreme = forecast(emp, '2026-08-16', '2026-08-28', asOf, customCtx, { scenario: 'extreme' });
    expect(extended.mult).toBe(2);
    expect(extreme.mult).toBe(3);

    // "normal" always stays ×1 regardless of what the other two are configured to
    const normal = forecast(emp, '2026-08-16', '2026-08-28', asOf, customCtx, { scenario: 'normal' });
    expect(normal.mult).toBe(1);
  });
});

describe('overtimeEngine: Mohamed Salah period reconciliation (HANDOVER.md §6)', () => {
  it('reconciles exactly against the reported HRMS figures for 16-28 Aug 2026', () => {
    const { emp, ctx } = loadEmployee(SALAH_ATT, 14800); // basic recovered via solveBasic(4098.03, 27.69)
    const r = runRange(emp, '2026-08-16', '2026-08-28', ctx);
    expect(r.recorded).toBe(3551);       // 59h11 — matches the report's Extra Hours column
    expect(r.genOT).toBe(1046);          // 17h26 general OT
    expect(r.pubOT).toBe(834);           // 13h54 holiday OT
    expect(r.otMin).toBe(1880);          // 31h20 total
    expect(r.pct).toBeCloseTo(27.69, 2);
    expect(r.amount).toBeCloseTo(4098.03, 2);
  });
});

describe('overtimeEngine: attendanceLabel — the read-only calendar/week-popup classifier', () => {
  const emp = { dutyDays: [0, 1, 2, 3, 4] };
  const base = { d: '2026-08-18', dow: 2, holiday: false, isOff: false, fromPunches: false, otRec: 0, status: 'work' };
  const TODAY = '2026-08-18';

  it('labels a leave status regardless of any recorded time', () => {
    expect(attendanceLabel({ ...base, status: 'annual' }, emp, DEF_CFG, false, TODAY)).toEqual({ key: 'leave', label: 'Leave: AL' });
    expect(attendanceLabel({ ...base, status: 'sick' }, emp, DEF_CFG, true, TODAY)).toEqual({ key: 'leave', label: 'Leave: SL' });
  });

  it('labels an explicit absent status', () => {
    expect(attendanceLabel({ ...base, status: 'absent' }, emp, DEF_CFG, true, TODAY)).toEqual({ key: 'absent', label: 'Absent' });
  });

  it('labels a duty day with real attendance as Present, and a non-duty day worked as Attended', () => {
    expect(attendanceLabel({ ...base, fromPunches: true }, emp, DEF_CFG, true, TODAY)).toEqual({ key: 'present', label: 'Present' });
    expect(attendanceLabel({ ...base, holiday: true, otRec: 90 }, emp, DEF_CFG, true, TODAY)).toEqual({ key: 'attended', label: 'Attended' });
  });

  it('labels a non-duty day with nothing recorded as Off duty', () => {
    expect(attendanceLabel({ ...base, holiday: true }, emp, DEF_CFG, false, TODAY)).toEqual({ key: 'offDuty', label: 'Off duty' });
  });

  it('labels a future duty day with no record as Scheduled, and a past one as No record (not Absent)', () => {
    expect(attendanceLabel({ ...base, d: '2026-08-20' }, emp, DEF_CFG, false, '2026-08-18')).toEqual({ key: 'scheduled', label: 'Scheduled' });
    expect(attendanceLabel({ ...base, d: '2026-08-16' }, emp, DEF_CFG, false, '2026-08-18')).toEqual({ key: 'noRecord', label: 'No record' });
  });
});

describe('overtimeEngine: punch log — deriving, editing and re-pairing card punches', () => {
  const H = (h, m = 0) => (h * 3600 + m * 60);

  it('derives one in/out pair per session, and no "out" punch for an open one', () => {
    const sessions = [{ i: H(8), o: H(17), open: false }, { i: H(16), o: null, open: true }];
    expect(derivePunches(sessions)).toEqual([
      { id: 's0i', type: 'in', sec: H(8) }, { id: 's0o', type: 'out', sec: H(17) },
      { id: 's1i', type: 'in', sec: H(16) },
    ]);
  });

  it('punchLog merges manual punches in and tags deleted ones from punchEdits, sorted chronologically', () => {
    const raw = {
      sessions: [{ i: H(8), o: H(15), open: false }],
      manualPunches: [{ id: 'man1', type: 'in', sec: H(16) }],
      punchEdits: { s0o: { deleted: true } },
    };
    const log = punchLog(raw);
    expect(log.map((p) => p.id)).toEqual(['s0i', 's0o', 'man1']);
    expect(log.find((p) => p.id === 's0o').deleted).toBe(true);
    expect(log.find((p) => p.id === 'man1').manual).toBe(true);
  });

  it('pairPunches re-pairs a flat chronological list, leaving a trailing unmatched "in" open', () => {
    const sessions = pairPunches([
      { type: 'in', sec: H(8) }, { type: 'out', sec: H(15) }, { type: 'in', sec: H(16) },
    ]);
    expect(sessions).toEqual([{ i: H(8), o: H(15), open: false }, { i: H(16), o: null, open: true }]);
  });

  it("effectiveSessions leaves an untouched day's sessions completely alone", () => {
    const raw = { sessions: [{ i: H(8), o: H(15), open: false }] };
    expect(effectiveSessions(raw)).toBe(raw.sessions); // same reference, not rebuilt
  });

  it('adding a missing card-out to an open session closes it and the extra hour now counts', () => {
    // card-in at 16:00, no card-out on file — the day's actual "add a checkout an hour late" case
    const raw = {
      status: 'work', schedS: null, schedE: null,
      sessions: [{ i: H(16), o: null, open: true }],
      manualPunches: [{ id: 'man1', type: 'out', sec: H(17) }],
    };
    const emp = { staffType: 'maintenance', dutyDays: DEF_CFG.dutyDays };
    const ctx = { cfg: DEF_CFG, holidays: {}, dayOf: () => raw };

    const before = dayFacts(emp, '2026-08-18', raw, ctx); // sessions as literally stored (still open)
    expect(before.recs).toHaveLength(0); // nothing claimable from an unresolved open session

    const resolved = { ...raw, sessions: effectiveSessions(raw) };
    expect(resolved.sessions).toEqual([{ i: H(16), o: H(17), open: false }]);
    const after = dayFacts(emp, '2026-08-18', resolved, ctx);
    expect(after.recs).toHaveLength(1);
    expect(after.recs[0].min).toBe(60); // exactly the added hour
  });

  it('deleting a punch drops it from the rebuilt sessions used for calculation', () => {
    const raw = { sessions: [{ i: H(8), o: H(17), open: false }], punchEdits: { s0o: { deleted: true } } };
    expect(effectiveSessions(raw)).toEqual([{ i: H(8), o: null, open: true }]);
  });

  it("a near-duplicate manual card-in doesn't fork one real session into two and double-count the day", () => {
    // real bug report: original punches 07:54 in / 18:19 out; adding a manual
    // "in" at 08:00 (a few minutes after the real one, no "out" in between)
    // must not read as its own unclosed all-day session on top of the real one
    const raw = {
      status: 'work', schedS: '08:00', schedE: '15:00',
      sessions: [{ i: H(7, 54), o: H(18, 19), open: false }],
      manualPunches: [{ id: 'man1', type: 'in', sec: H(8, 0) }],
    };
    const sessions = effectiveSessions(raw);
    expect(sessions).toEqual([{ i: H(7, 54), o: H(18, 19), open: false }]); // the earlier "in" wins, still one session

    const emp = { staffType: 'maintenance', dutyDays: DEF_CFG.dutyDays };
    const ctx = { cfg: DEF_CFG, holidays: {}, dayOf: () => raw };
    const facts = dayFacts(emp, '2026-08-24', { ...raw, sessions }, ctx);
    expect(facts.normalMin).toBe(420); // 7h duty — not 14h from a phantom second session
    expect(facts.recs).toHaveLength(1);
    expect(facts.recs[0].min).toBe(199); // 3h19m extra, unchanged by the duplicate punch
  });
});
