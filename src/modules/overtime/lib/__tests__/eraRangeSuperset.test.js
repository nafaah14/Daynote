/**
 * eraRange() was only actually wired into the Overtime tab; every other
 * screen (forecast/Overview, PersonView, the roster calendar, PDF exports)
 * still called runRange() directly, so a period touching HRMS-imported or
 * old-rule data could show different numbers on different screens. Fixing
 * that means swapping every call site to eraRange, which only works if
 * eraRange is a true superset of runRange's return shape and behaviour for
 * an ordinary range with nothing to rebucket — this pins that.
 */
import { describe, it, expect } from 'vitest';
import { DEF_CFG, runRange, runWeek, weekStart } from '../overtimeEngine';
import { eraRange } from '../legacyCfg';

const emp = { no: 'X', staffType: 'maintenance', dutyDays: DEF_CFG.dutyDays, dutyMin: 420, basic: 20000 };
const days = {
  '2026-08-02': { status: 'work', schedS: '08:00', schedE: '15:00', sessions: [{ i: 8 * 3600, o: 19 * 3600 }] },
  '2026-08-06': { status: 'work', schedS: '08:00', schedE: '15:00', sessions: [{ i: 8 * 3600, o: 20 * 3600 }] },
  '2026-08-07': { status: 'work', schedS: '08:00', schedE: '15:00', sessions: [{ i: 8 * 3600, o: 22 * 3600 }] }, // Friday
};
const ctx = { cfg: DEF_CFG, holidays: {}, dayOf: (no, d) => days[d] };

describe('eraRange — a true superset of runRange for a range with nothing to rebucket', () => {
  const from = '2026-08-01', to = '2026-08-15'; // entirely post-cutover, no otFromClaims days
  const plain = runRange(emp, from, to, ctx, {});
  const era = eraRange(emp, from, to, ctx, {});

  it('matches every field runRange returns', () => {
    expect(era.genOT).toBe(plain.genOT);
    expect(era.pubOT).toBe(plain.pubOT);
    expect(era.otMin).toBe(plain.otMin);
    expect(era.worked).toBe(plain.worked);
    expect(era.recorded).toBe(plain.recorded);
    expect(era.incompleteMin).toBe(plain.incompleteMin);
    expect(era.pending).toBe(plain.pending);
    expect(era.pendingDays).toBe(plain.pendingDays);
    expect(era.pendingRecs).toBe(plain.pendingRecs);
    expect(era.openDays).toBe(plain.openDays);
    expect(era.blockedMin).toBe(plain.blockedMin);
    expect(era.days).toHaveLength(plain.days.length);
  });

  it('reconstructs the same weekly grouping', () => {
    expect(era.weeks).toHaveLength(plain.weeks.length);
    era.weeks.forEach((w, i) => {
      expect(w.start).toBe(plain.weeks[i].start);
      expect(w.days.map((d) => d.d)).toEqual(plain.weeks[i].days.map((d) => d.d));
    });
  });

  it('forwards opts.overlay through exactly like runRange, which forecast()\'s modelled future days depend on', () => {
    // A modest overlay on an ordinary Monday whose week is nowhere near the
    // 48h line legitimately adds nothing to otMin in EITHER path (its extra
    // time is "blocked" — recorded but not yet past the line) — the point
    // here isn't that the overlay raises the total, it's that eraRange and
    // runRange treat the same overlay identically, gate or no gate.
    const overlay = { '2026-08-10': { status: 'work', otMin: 120, approvedMin: 120, approved: true, src: 'forecast' } };
    const withOverlay = eraRange(emp, from, to, ctx, { overlay });
    const plainWithOverlay = runRange(emp, from, to, ctx, { overlay });
    expect(withOverlay.otMin).toBe(plainWithOverlay.otMin);
    expect(withOverlay.worked).toBe(plainWithOverlay.worked);
    // A large enough overlay on a week already close to the line DOES push
    // it over — proving the overlay really is live, not silently dropped.
    const bigOverlay = { '2026-08-10': { status: 'work', otMin: 2000, approvedMin: 2000, approved: true, src: 'forecast' } };
    const withBigOverlay = eraRange(emp, from, to, ctx, { overlay: bigOverlay });
    expect(withBigOverlay.otMin).toBeGreaterThan(era.otMin);
  });
});

describe('runWeek — cumAfter is the running weekly-credit total the Overtime page shows per row', () => {
  it('resets to 0 each Sunday and lands exactly on the week\'s own total by Saturday', () => {
    const week = runWeek(emp, weekStart('2026-08-02'), ctx);
    // Sunday's cumBefore starts a fresh week at 0, regardless of any prior week's total.
    expect(week.days[0].cumBefore).toBe(0);
    // Every day's own credit is exactly what cumAfter grew by since cumBefore.
    week.days.forEach((d) => expect(d.cumAfter - d.cumBefore).toBe(d.credit));
    // The last day's cumAfter is the same figure the week banner (week.total) states.
    expect(week.days[week.days.length - 1].cumAfter).toBe(week.total);
  });
});

describe('eraRange — the one week straddling the cutover', () => {
  it('appears exactly once in `weeks`, not duplicated by both the pre and post slice', () => {
    // 2026-08-01 falls inside a calendar week that both the pre-cutover
    // (LEGACY_CFG) call and the post-cutover call would otherwise each
    // produce their own runWeek entry for.
    const era = eraRange(emp, '2026-07-28', '2026-08-05', ctx, {});
    const starts = era.weeks.map((w) => w.start);
    expect(new Set(starts).size).toBe(starts.length); // no duplicate start dates
  });
});
