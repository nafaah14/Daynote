/**
 * A late card-out isn't necessarily late work — someone can linger on-site
 * well past the point their work actually ended, and the card only sees
 * when they physically left. HRMS's "Daily OT Limit" is the real cutoff:
 * only the authorised portion of a claim counts toward the 48h weekly
 * requirement, not the raw card-to-card length.
 *
 * Built directly from a real case: Salah, 3 Aug 2026, card-out 20:12 off a
 * 15:00 start (5h 12m raw), authorised for 3h 00m by HRMS (cutoff 18:00).
 * `creditedMin` used to credit the full 5h 12m toward the weekly line for
 * ANY not-yet-paid entry — this pins that it now credits only the
 * authorised 3h 00m, while the payable totals (which already read the
 * authorised figure, never the raw one) are unaffected.
 */
import { describe, it, expect } from 'vitest';
import { DEF_CFG, creditedMin, runWeek, normRecs } from '../overtimeEngine';

describe('creditedMin', () => {
  it('caps a held entry\'s weekly credit at what HRMS actually authorised, not the raw card length', () => {
    const heldEntry = { app: false, holdUntilApproved: true, min: 312, appMin: 180 }; // 5h12m raw, 3h00m authorised
    expect(creditedMin(heldEntry)).toBe(180);
  });

  it('is a no-op for a plain card entry with no authorisation data of its own', () => {
    const cardEntry = { app: false, min: 90, appMin: 90 }; // appMin defaults to min when nothing overrides it
    expect(creditedMin(cardEntry)).toBe(90);
  });

  it('caps a pending (not yet decided) entry the same way — HRMS\'s requested figure, not raw duration', () => {
    const pendingEntry = { app: false, min: 91, appMin: 30 }; // e.g. Shujau's 18 Aug: 1h31m raw, 30min requested
    expect(creditedMin(pendingEntry)).toBe(30);
  });

  it('a confirmed limitMin overrides HRMS\'s own default, without needing the entry to be approved for pay', () => {
    const heldEntry = { app: false, holdUntilApproved: true, min: 312, appMin: 180, limitMin: 220 };
    expect(creditedMin(heldEntry)).toBe(220); // the person's confirmed figure, not HRMS's 180 default
  });

  it('once paid, appMin alone decides credit — a leftover limitMin from before approval is ignored', () => {
    const paidEntry = { app: true, min: 312, appMin: 180, limitMin: 220 };
    expect(creditedMin(paidEntry)).toBe(180);
  });
});

describe('the weekly line, for a real held day (Salah, 3 Aug 2026)', () => {
  const emp = { no: 'X', staffType: 'maintenance', dutyDays: DEF_CFG.dutyDays, dutyMin: 420, basic: 20000 };
  // A realistic imported day: the routine attendance import still populated
  // `sessions` (a single continuous card-in-to-card-out span), and the
  // legacy claim import added the real HRMS entry on top, suppressing that
  // session-derived rec via otFromClaims (see the otFromClaims tests) so
  // the day's only rec is the claim itself.
  const day = {
    status: 'work', schedS: '08:00', schedE: '15:00', otFromClaims: true,
    sessions: [{ i: 8 * 3600, o: (20 * 3600) + (12 * 60) }], // 08:00 - 20:12
    manualRecs: [{
      id: 'leg_150000_201209', s: '15:00', e: '20:12', min: 312, appMin: 180,
      kind: 'legacy', holdUntilApproved: true,
    }],
    appr: {},
  };
  const ctx = { cfg: DEF_CFG, holidays: {}, dayOf: (no, d) => (d === '2026-08-03' ? day : null) };

  it('credits the day 7h duty + 3h authorised OT = 10h, not 7h duty + 5h12m raw = 12h12m', () => {
    const week = runWeek(emp, '2026-08-02', ctx); // the Sunday starting that week
    const d = week.days.find((x) => x.d === '2026-08-03');
    expect(d.duty).toBe(420); // 7h, the normal office day
    expect(d.credit).toBe(600); // 10h — exactly duty + the authorised 3h, not duty + the raw 5h12m (732)
  });
});

describe('normRecs propagates a confirmed limitMin for every source, not just HRMS imports', () => {
  const emp = { no: 'X', staffType: 'maintenance', dutyDays: DEF_CFG.dutyDays, dutyMin: 420, basic: 20000 };
  const ctx = { cfg: DEF_CFG, holidays: {}, dayOf: () => null };

  // Plain card punches, no HRMS import at all — the ordinary shape of an
  // ongoing/ current salary period before anything has been imported. The
  // "Confirm limit" button used to write appr[id].limitMin correctly but
  // normRecs' raw.sessions branch silently dropped it on the way back out,
  // so the credited figure on screen never moved. This pins the read side.
  it('a card-derived (raw.sessions) entry reads back a confirmed limitMin', () => {
    const raw = {
      status: 'work', schedS: '08:00', schedE: '15:00',
      sessions: [{ i: 8 * 3600, o: 19 * 3600 }], // 08:00 - 19:00, ~4h extra past a 15:00 sched end
      appr: { s0: { limitMin: 185 } },
    };
    const recs = normRecs(emp, '2026-08-31', raw, ctx);
    const r = recs.find((x) => x.id === 's0');
    expect(r).toBeTruthy();
    expect(r.limitMin).toBe(185);
  });

  // The legacy raw.recs/raw.otMin fallback branch (older imported data
  // shaped without `sessions`) — same bug, same fix, same read-back check.
  it('a legacy raw.recs-derived entry also reads back a confirmed limitMin', () => {
    const raw = { recs: [{ id: 'r0', s: '15:00', e: '19:00', min: 240 }], appr: { r0: { limitMin: 150 } } };
    const recs = normRecs(emp, '2026-08-31', raw, ctx);
    const r = recs.find((x) => x.id === 'r0');
    expect(r).toBeTruthy();
    expect(r.limitMin).toBe(150);
  });
});
