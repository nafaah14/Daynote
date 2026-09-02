/**
 * End-to-end guard over the whole chain that produces the individual
 * overtime report: parsed HRMS claims -> buildDayImport's manualRecs/appr
 * -> eraRange's era-aware, ungated-before-cutover bucketing -> the two
 * summary panels. Pinned to the six figures HRMS publishes for Mohamed
 * Salah, 16 Jul - 15 Aug 2026.
 *
 * The unit tests either side of this each passed while the report was still
 * wrong in the browser, because the fault was in how the pieces combined
 * (and, separately, in day records an attendance re-import had overwritten).
 * If these move, the report a payroll decision gets made from has moved.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseMyOvertimesMhtml } from '../legacyApprovalImport';
import { DEF_CFG } from '../overtimeEngine';
import { eraRange } from '../legacyCfg';
import { buildDayImport } from '../../state/useLegacyApprovalImporter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'my-overtimes-salah-2026-07-16_2026-08-15.mhtml');

// Only 26 Jul is a public holiday in this window. 14 Aug (Qaumee Dhuvas) is
// already a Friday; 15 Aug is NOT holiday-rated — HRMS prices that Saturday
// as an ordinary general day, confirmed against its published totals.
const HOLIDAYS = { '2026-07-26': 'Independence Day' };

function importedCtx() {
  const { claims } = parseMyOvertimesMhtml(readFileSync(FIXTURE, 'utf8'));
  const byDate = new Map();
  claims.forEach((c) => { if (!byDate.has(c.date)) byDate.set(c.date, []); byDate.get(c.date).push(c); });
  const days = {};
  byDate.forEach((dayClaims, date) => {
    // A period long since closed, so nothing is auto-approved by date alone.
    const { patch } = buildDayImport(date, dayClaims, null, '2026-09-16');
    days[date] = { ...patch, date };
  });
  const emp = { no: 'X', name: 'Salah', staffType: 'maintenance', dutyDays: [...DEF_CFG.dutyDays], dutyMin: 420, basic: 20000, active: true };
  return { emp, ctx: { cfg: DEF_CFG, holidays: HOLIDAYS, dayOf: (no, d) => days[d] } };
}

describe('individual report pipeline — Salah 16 Jul – 15 Aug 2026', () => {
  const { emp, ctx } = importedCtx();
  const all = eraRange(emp, '2026-07-16', '2026-08-15', ctx, {});
  const approved = eraRange(emp, '2026-07-16', '2026-08-15', ctx, { approved: true });

  it('reproduces HRMS\'s "All Overtimes" panel', () => {
    expect(all.pubOT).toBe(2831);  // 47h 11m Friday / public holiday
    expect(all.genOT).toBe(4813);  // 80h 13m general days
    expect(all.otMin).toBe(7644);  // 127h 24m total
  });

  it('reproduces HRMS\'s "Approved Overtimes" panel', () => {
    expect(approved.pubOT).toBe(2490); // 41h 30m
    expect(approved.genOT).toBe(4073); // 67h 53m
    expect(approved.otMin).toBe(6563); // 109h 23m
  });

  it('keeps the two panels distinct — All is recorded time, Approved is authorised', () => {
    // These collapsing onto one another is the signature of held claims
    // having been approved, or of the day reverting to card-derived recs.
    expect(all.otMin).toBeGreaterThan(approved.otMin);
  });

  it('reports the unpaid "Incomplete Working Hours" separately, not in either total', () => {
    expect(all.incompleteMin).toBe(1555); // 25h 55m
  });
});
