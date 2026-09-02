import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseMyOvertimesMhtml } from '../legacyApprovalImport';
import { dparse } from '../overtimeEngine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'my-overtimes-salah-2026-07-16_2026-08-15.mhtml');
const PENDING_FIXTURE = join(__dirname, 'fixtures', 'my-overtimes-shujau-pending-2026-08.mhtml');
const FAIZAN_FIXTURE = join(__dirname, 'fixtures', 'my-overtimes-faizan-2026-07-16_2026-08-15.mhtml');

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

  it('treats an authorised-but-incomplete row as unpaid, not approved', () => {
    // The trap: this row DOES carry an authorised figure ("3 hrs 30 mins
    // authorised", color-success). But its background is
    // incomplete-hours-bg — those hours went towards the weekly required
    // hours, so HRMS authorises them and still does not pay them. Reading
    // the authorisation marker as "approved" overstates pay; only the row
    // background settles it. Verified against Faizan's published totals.
    const c = result.claims.find((c) => c.date === '2026-08-02');
    expect(c.status).toBe('incomplete');
    expect(c.approvedMin).toBeNull(); // nothing payable
    expect(c.authorisedMin).toBe(210); // but 3h30m was authorised
    expect(c.durationMin).toBe(213); // 3 hrs 33 mins actually worked
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

  it('distinguishes an unrequested incomplete day from one with a pending request', () => {
    const incomplete = result.claims.filter((c) => c.status === 'incomplete');
    const pending = result.claims.filter((c) => c.status === 'pending');
    expect(incomplete.map((c) => c.date)).toEqual(['2026-08-16', '2026-08-17']);
    incomplete.forEach((c) => {
      expect(c.approvedMin).toBeNull();
      expect(c.pendingMin).toBeNull();
      expect(c.authorisedMin).toBeNull(); // nothing was ever requested
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].date).toBe('2026-08-18');
    expect(pending[0].approvedMin).toBeNull(); // requested, not yet payable
    expect(pending[0].pendingMin).toBe(30); // "0 hrs 30 mins" requested, not the full 91min worked
  });
});

/**
 * The reconciliation that pins the whole claim-state model: Ahmed Faizan
 * (160057), 16 Jul – 15 Aug 2026, against the six figures HRMS itself
 * publishes for that period. Every one is reproduced to the minute purely
 * from the parsed claims, which is what establishes that "paid" is decided
 * by the row background and nothing else.
 *
 * If any of these move, the parser has changed what it believes HRMS means —
 * stop and re-derive it from the file, don't update the numbers.
 */
describe('parseMyOvertimesMhtml — Faizan reconciliation against HRMS totals', () => {
  const result = parseMyOvertimesMhtml(readFileSync(FAIZAN_FIXTURE, 'utf8'));
  // Jul 26 2026 is a declared public holiday in the client's calendar — it
  // is a Sunday, and HRMS prices its hours at the holiday rate.
  const PUBLIC_HOLIDAYS = new Set(['2026-07-26']);
  const isPub = (c) => dparse(c.date).getDay() === 5 || PUBLIC_HOLIDAYS.has(c.date);

  const paid = result.claims.filter((c) => c.status === 'approved');
  const held = result.claims.filter((c) => c.status !== 'approved');
  const sum = (list, f) => list.reduce((s, c) => s + f(c), 0);

  it('recovers every claim row', () => {
    expect(result.employeeSid).toBe('160057');
    expect(result.claims).toHaveLength(28);
  });

  it('matches HRMS "All Overtimes" — recorded time on payable rows', () => {
    expect(sum(paid, (c) => c.durationMin)).toBe(6309); // 105 hrs 9 mins
  });

  it('matches HRMS "Approved Overtimes" — authorised time on payable rows', () => {
    expect(sum(paid, (c) => c.approvedMin)).toBe(5797); // 96 hrs 37 mins
  });

  it('matches HRMS "Incomplete Working Hours" — recorded time on unpaid rows', () => {
    expect(sum(held, (c) => c.durationMin)).toBe(1624); // 27 hrs 4 mins
  });

  it('matches HRMS\'s Friday/public-holiday vs general split, both columns', () => {
    const pub = paid.filter(isPub), gen = paid.filter((c) => !isPub(c));
    expect(sum(pub, (c) => c.durationMin)).toBe(2002); // 33 hrs 22 mins
    expect(sum(pub, (c) => c.approvedMin)).toBe(1795); // 29 hrs 55 mins
    expect(sum(gen, (c) => c.durationMin)).toBe(4307); // 71 hrs 47 mins
    expect(sum(gen, (c) => c.approvedMin)).toBe(4002); // 66 hrs 42 mins
  });
});
