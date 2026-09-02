/**
 * Guards the double-counting fix `otFromClaims` exists to prevent: a date
 * with both real card sessions (attendance import) and an imported legacy
 * claim (legacyApprovalImport.js -> useLegacyApprovalImporter.js) must count
 * the claim once, not the card-based estimate *and* the claim.
 */
import { describe, it, expect } from 'vitest';
import { DEF_CFG, normRecs } from '../overtimeEngine';

const emp = { no: 'X', staffType: 'maintenance', dutyDays: DEF_CFG.dutyDays, dutyMin: 420, basic: 1000 };
const d = '2026-01-05'; // a plain Monday, no holiday
const ctx = { cfg: DEF_CFG, holidays: {}, dayOf: () => null };

const baseRaw = {
  status: 'work', schedS: '08:00', schedE: '15:00',
  sessions: [{ i: 8 * 3600, o: 16 * 3600 }], // 08:00-16:00, 1h past the 15:00 schedule end
  manualRecs: [{ id: 'leg_160000_163000', s: '16:00', e: '16:30', min: 30, appMin: 30, kind: 'legacy' }],
};

describe('normRecs — otFromClaims suppresses the card-based estimate', () => {
  it('without the flag, both the session-derived rec and the manual claim count (the bug this guards against)', () => {
    const recs = normRecs(emp, d, baseRaw, ctx);
    expect(recs).toHaveLength(2);
    expect(recs.some((r) => r.kind === 'extension')).toBe(true);
    expect(recs.some((r) => r.id === 'leg_160000_163000')).toBe(true);
  });

  it('with otFromClaims, only the imported claim counts', () => {
    const recs = normRecs(emp, d, { ...baseRaw, otFromClaims: true }, ctx);
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe('leg_160000_163000');
    expect(recs[0].min).toBe(30);
  });
});
