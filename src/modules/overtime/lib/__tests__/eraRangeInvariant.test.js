/**
 * The property the Overtime page rebuild depends on: eraRange()'s totals
 * are a literal sum of the `days` it returns, for every mode (all-time and
 * approved) and every day kind (old-rule, live-gated, HRMS-imported). If a
 * row shown on screen and the period total it rolls into can ever disagree,
 * the page stops being checkable by eye — this is what rules that out.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseMyOvertimesMhtml } from '../legacyApprovalImport';
import { DEF_CFG, sum } from '../overtimeEngine';
import { eraRange } from '../legacyCfg';
import { buildDayImport } from '../../state/useLegacyApprovalImporter';

const __dirname = dirname(fileURLToPath(import.meta.url));

function assertSelfConsistent(r) {
  expect(r.genOT).toBe(sum(r.days, (d) => d.genOT));
  expect(r.pubOT).toBe(sum(r.days, (d) => d.pubOT));
  expect(r.otMin).toBe(r.genOT + r.pubOT);
  expect(r.worked).toBe(sum(r.days, (d) => d.credit));
  expect(r.incompleteMin).toBe(sum(r.days, (d) => d.incompleteMin));
  expect(r.recorded).toBe(sum(r.days, (d) => d.otRec));
}

describe('eraRange — totals are a sum of the returned days', () => {
  it('holds for a pure live-rules range (card-derived, weekly-gated days)', () => {
    const emp = { no: 'X', staffType: 'maintenance', dutyDays: DEF_CFG.dutyDays, dutyMin: 420, basic: 1000 };
    const days = {
      '2026-08-02': { status: 'work', schedS: '08:00', schedE: '15:00', sessions: [{ i: 8 * 3600, o: 19 * 3600 }] },
      '2026-08-03': { status: 'work', schedS: '08:00', schedE: '15:00', sessions: [{ i: 8 * 3600, o: 20 * 3600 }] },
    };
    const ctx = { cfg: DEF_CFG, holidays: {}, dayOf: (no, d) => days[d] };
    assertSelfConsistent(eraRange(emp, '2026-08-01', '2026-08-07', ctx, {}));
    assertSelfConsistent(eraRange(emp, '2026-08-01', '2026-08-07', ctx, { approved: true }));
  });

  it('holds for a real imported HRMS period straddling the cutover (Faizan)', () => {
    const { claims } = parseMyOvertimesMhtml(readFileSync(
      join(__dirname, 'fixtures', 'my-overtimes-faizan-2026-07-16_2026-08-15.mhtml'), 'utf8'
    ));
    const byDate = new Map();
    claims.forEach((c) => { if (!byDate.has(c.date)) byDate.set(c.date, []); byDate.get(c.date).push(c); });
    const days = {};
    byDate.forEach((dayClaims, date) => {
      const { patch } = buildDayImport(date, dayClaims, null, '2026-09-16');
      days[date] = { ...patch, date };
    });
    const emp = { no: 'X', staffType: 'maintenance', dutyDays: DEF_CFG.dutyDays, dutyMin: 420, basic: 20000, active: true };
    const ctx = { cfg: DEF_CFG, holidays: { '2026-07-26': 'Independence Day' }, dayOf: (no, d) => days[d] };

    assertSelfConsistent(eraRange(emp, '2026-07-16', '2026-08-15', ctx, {}));
    assertSelfConsistent(eraRange(emp, '2026-07-16', '2026-08-15', ctx, { approved: true }));
  });
});
