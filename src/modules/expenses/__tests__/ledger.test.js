import { describe, it, expect } from 'vitest';
import { buildLedger } from '../ledger';

const entry = (income, expense) => ({ data: { income, expense } });

describe('buildLedger', () => {
  it('carries the balance row by row, like the sheet', () => {
    const page = { data: { opening: 19494 } };
    const l = buildLedger(page, [entry(4000, 0), entry(0, 1250.5)]);
    expect(l.rows.map((r) => r.balance)).toEqual([23494, 22243.5]);
    expect(l.totalIn).toBe(4000);
    expect(l.totalOut).toBe(1250.5);
    expect(l.closing).toBe(22243.5);
  });

  it('treats a missing opening balance as zero', () => {
    expect(buildLedger({ data: {} }, [entry(0, 300)]).closing).toBe(-300);
  });
});
