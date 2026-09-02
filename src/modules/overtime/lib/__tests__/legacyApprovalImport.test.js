import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseMyOvertimesMhtml } from '../legacyApprovalImport';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'my-overtimes-salah-2026-07-16_2026-08-15.mhtml');
const PENDING_FIXTURE = join(__dirname, 'fixtures', 'my-overtimes-shujau-pending-2026-08.mhtml');

describe('parseMyOvertimesMhtml — Salah sample (all-approved period)', () => {
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
    expect(c.durationCheckOk).toBe(true);
  });

  it('splits two same-day claims into their own approved amounts', () => {
    const dayClaims = result.claims.filter((c) => c.date === '2026-07-20');
    expect(dayClaims).toHaveLength(2);
    expect(dayClaims.map((c) => c.approvedMin)).toEqual([271, 150]);
    dayClaims.forEach((c) => expect(c.status).toBe('approved'));
  });

  it('recognizes a claim approved via a standing work schedule, not a per-day "Used Daily Limit" claim', () => {
    // This row's Daily-OT-Limit cell has no "Used Daily Limit" tooltip at
    // all — just a bare color-success span reading "Covered by your
    // approved work schedule" / "3 hrs 30 mins authorised" elsewhere in the
    // row. A parser keyed only on that tooltip text misses this entirely.
    const c = result.claims.find((c) => c.date === '2026-08-02');
    expect(c.status).toBe('approved');
    expect(c.durationMin).toBe(213); // 3 hrs 33 mins, raw worked time
    expect(c.approvedMin).toBe(210); // 3 hrs 30 mins, the authorised amount
  });

  it('every claim\'s stated duration agrees with its own start/end times', () => {
    const bad = result.claims.filter((c) => c.durationCheckOk === false);
    expect(bad).toEqual([]);
  });
});

describe('parseMyOvertimesMhtml — pending/unclaimed sample', () => {
  const text = readFileSync(PENDING_FIXTURE, 'utf8');
  const result = parseMyOvertimesMhtml(text);

  it('identifies the employee', () => {
    expect(result.employeeName).toBe('Ahmed Shujau');
    expect(result.employeeSid).toBe('230157');
  });

  it('recovers all 3 claim rows', () => {
    expect(result.claims).toHaveLength(3);
  });

  it('parses this session\'s Angular component id ("ixq"), not just the other sample\'s ("gps")', () => {
    // Regression guard for the cell-splitter's id-prefix bug: this file was
    // saved from a different browser session than the Salah fixture, so its
    // rows use a different Angular-generated `_ngcontent-*` id. A parser
    // that hardcodes one session's id silently returns zero claims here.
    expect(result.claims.every((c) => c.start && c.end)).toBe(true);
  });

  it('distinguishes "unclaimed" from "pending approval" even though both share the same row background and Duration-cell label', () => {
    const unclaimed = result.claims.filter((c) => c.status === 'unclaimed');
    const pending = result.claims.filter((c) => c.status === 'pending');
    expect(unclaimed.map((c) => c.date)).toEqual(['2026-08-16', '2026-08-17']);
    unclaimed.forEach((c) => {
      expect(c.approvedMin).toBeNull();
      expect(c.pendingMin).toBeNull();
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].date).toBe('2026-08-18');
    expect(pending[0].approvedMin).toBeNull();
    expect(pending[0].pendingMin).toBe(30); // "0 hrs 30 mins" requested, not the full 91min raw duration
  });
});
