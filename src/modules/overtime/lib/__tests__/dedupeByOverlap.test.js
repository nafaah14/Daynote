/**
 * The single guarantee that one worked hour is never paid twice.
 *
 * An OT entry can reach a day from three places — measured from card
 * punches, imported from HRMS, or hand-added by a supervisor — and they all
 * describe the same clock. Before this rule existed, an HRMS claim and a
 * manual approval of the same hours both counted, and the workaround was a
 * per-day `otFromClaims` flag that had to be remembered at every call site.
 */
import { describe, it, expect } from 'vitest';
import { dedupeByOverlap, normRecs, DEF_CFG } from '../overtimeEngine';

const e = (source, s, en, extra = {}) => ({ id: `${source}-${s}`, source, s, e: en, min: 60, appMin: 60, ...extra });
const ids = (list) => list.map((r) => r.id);

describe('dedupeByOverlap', () => {
  it('drops a card estimate covered by an HRMS claim', () => {
    const kept = dedupeByOverlap([e('card', '16:00', '18:17'), e('hrms', '15:00', '18:16')]);
    expect(ids(kept)).toEqual(['hrms-15:00']);
  });

  it('drops a card estimate covered by a manual entry', () => {
    const kept = dedupeByOverlap([e('card', '16:00', '18:17'), e('manual', '15:30', '18:00')]);
    expect(ids(kept)).toEqual(['manual-15:30']);
  });

  it('drops a manual entry covering the same hours as an HRMS claim — the reported double-pay case', () => {
    const kept = dedupeByOverlap([e('manual', '15:00', '18:16'), e('hrms', '15:00', '18:16')]);
    expect(ids(kept)).toEqual(['hrms-15:00']);
  });

  it('keeps entries that do not overlap, whatever their source', () => {
    const kept = dedupeByOverlap([e('card', '03:27', '07:59'), e('hrms', '15:00', '18:16')]);
    expect(ids(kept)).toEqual(['card-03:27', 'hrms-15:00']);
  });

  it('treats touching-but-not-overlapping windows as distinct', () => {
    const kept = dedupeByOverlap([e('card', '15:00', '16:00'), e('hrms', '16:00', '17:00')]);
    expect(kept).toHaveLength(2);
  });

  it('handles a window running past midnight', () => {
    const kept = dedupeByOverlap([e('card', '23:00', '01:00'), e('hrms', '22:00', '02:00')]);
    expect(ids(kept)).toEqual(['hrms-22:00']);
  });

  it('returns entries in clock order regardless of input order', () => {
    const kept = dedupeByOverlap([e('hrms', '15:00', '16:00'), e('card', '03:00', '04:00')]);
    expect(ids(kept)).toEqual(['card-03:00', 'hrms-15:00']);
  });

  it('never drops an entry with no clock window', () => {
    const kept = dedupeByOverlap([{ id: 'nowindow', source: 'manual', min: 30 }, e('hrms', '15:00', '18:00')]);
    expect(kept).toHaveLength(2);
  });
});

describe('normRecs — dedupe applied to a real day', () => {
  const emp = { no: 'X', staffType: 'maintenance', dutyDays: DEF_CFG.dutyDays, dutyMin: 420, basic: 1000 };
  const ctx = { cfg: DEF_CFG, holidays: {}, dayOf: () => null };

  it('an imported claim replaces the card estimate for the same hours', () => {
    const raw = {
      status: 'work', schedS: '08:00', schedE: '15:00',
      sessions: [{ i: 8 * 3600, o: 18 * 3600 }], // card says 15:00-18:00 is extra
      manualRecs: [{ id: 'leg_150000_180000', s: '15:00', e: '18:00', min: 180, appMin: 150, kind: 'legacy' }],
      appr: { leg_150000_180000: { app: true, appMin: 150 } },
    };
    const recs = normRecs(emp, '2026-01-05', raw, ctx);
    expect(recs).toHaveLength(1);
    expect(recs[0].source).toBe('hrms');
    expect(recs[0].appMin).toBe(150);
  });
});
