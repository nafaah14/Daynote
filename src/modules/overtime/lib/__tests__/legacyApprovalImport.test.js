import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseMyOvertimesMhtml } from '../legacyApprovalImport';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'my-overtimes-salah-2026-07-16_2026-08-15.mhtml');

describe('parseMyOvertimesMhtml', () => {
  const text = readFileSync(FIXTURE, 'utf8');
  const result = parseMyOvertimesMhtml(text);

  it('identifies the employee from the page\'s own selector', () => {
    expect(result.employeeName).toBe('Mohamed Salah');
    expect(result.employeeSid).toBe('120076');
  });

  it('recovers all 30 claim rows', () => {
    expect(result.claims).toHaveLength(30);
  });

  it('parses a single-claim approved day', () => {
    const c = result.claims.find((c) => c.date === '2026-07-16');
    expect(c.status).toBe('approved');
    expect(c.durationMin).toBe(138); // 2 hrs 18 mins
    expect(c.approvedMin).toBe(90); // 1 hrs 30 mins
    expect(c.dailyLimitMin).toBe(90);
    expect(c.usedLimitMin).toBe(90);
    expect(c.durationCheckOk).toBe(true);
  });

  it('splits a shared daily limit across two claims on the same date', () => {
    const dayClaims = result.claims.filter((c) => c.date === '2026-07-20');
    expect(dayClaims).toHaveLength(2);
    dayClaims.forEach((c) => expect(c.dailyLimitMin).toBe(421)); // 7 hrs 1 min, shared
    const usedSum = dayClaims.reduce((s, c) => s + c.usedLimitMin, 0);
    expect(usedSum).toBe(421);
  });

  it('marks a post-cutover "Incomplete Working Hours" claim as unresolved, not zero', () => {
    const c = result.claims.find((c) => c.date === '2026-08-02');
    expect(c.status).toBe('incomplete');
    expect(c.approvedMin).toBeNull();
    expect(c.durationMin).toBe(213); // 3 hrs 33 mins, still recorded even though not yet approved
  });

  it('every claim\'s stated duration agrees with its own start/end times', () => {
    const bad = result.claims.filter((c) => c.durationCheckOk === false);
    expect(bad).toEqual([]);
  });
});
