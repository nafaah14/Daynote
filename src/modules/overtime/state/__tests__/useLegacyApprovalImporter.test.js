/**
 * Regression guard for a real bug: Mohamed Salah was imported under an
 * earlier parser that wrongly classified 9 "incomplete-hours-bg" claims as
 * approved, writing `appr[id] = { app: true, ... }` directly (no `src`
 * stamp — that field didn't exist yet). Re-importing him with the fixed
 * parser changed nothing, because "never overwrite an existing decision"
 * couldn't tell that stale entry apart from a supervisor's real approve.
 * `buildDayImport` must now redecide anything it stamped itself, while
 * still never touching a decision without that stamp.
 */
import { describe, it, expect } from 'vitest';
import { buildDayImport } from '../useLegacyApprovalImporter';

const incompleteClaim = {
  date: '2026-08-02', start: '15:00:00', end: '18:33:19', durationMin: 213,
  status: 'incomplete', approvedMin: null, pendingMin: null, authorisedMin: 210,
  reason: 'Duty over time — Counted towards weekly required hours', durationCheckOk: true,
};

describe('buildDayImport', () => {
  it('clears a stale approval this same importer wrote on an earlier, buggier run', () => {
    const staleFromOldImport = { appr: { leg_150000_183319: { app: true, appMin: 210, src: 'legacy-import' } } };
    const { patch, pendingCount } = buildDayImport('2026-08-02', [incompleteClaim], staleFromOldImport, '2026-08-16');
    expect(patch.appr.leg_150000_183319).toBeUndefined();
    expect(patch.manualRecs[0].holdUntilApproved).toBe(true);
    expect(pendingCount).toBe(1);
  });

  it('never touches a decision a person actually made (no src stamp)', () => {
    const supervisorApproved = { appr: { leg_150000_183319: { app: true, appMin: 213 } } };
    const { patch } = buildDayImport('2026-08-02', [incompleteClaim], supervisorApproved, '2026-08-16');
    expect(patch.appr.leg_150000_183319).toEqual({ app: true, appMin: 213 });
  });

  it('leaves a fresh incomplete claim undecided, not approved', () => {
    const { patch, pendingCount, approvedCount } = buildDayImport('2026-08-02', [incompleteClaim], null, '2026-08-16');
    expect(patch.appr.leg_150000_183319).toBeUndefined();
    expect(pendingCount).toBe(1);
    expect(approvedCount).toBe(0);
  });

  it('auto-approves a pending claim once its own salary period has closed', () => {
    const pending = { ...incompleteClaim, status: 'pending', pendingMin: 30, authorisedMin: null };
    const { patch, autoApprovedCount } = buildDayImport('2026-08-02', [pending], null, '2026-09-16'); // period Jul16-Aug15 now closed
    expect(patch.appr.leg_150000_183319).toEqual({ app: true, appMin: 30, autoApproved: true, src: 'legacy-import' });
    expect(autoApprovedCount).toBe(1);
  });

  it('leaves a pending claim undecided while its own salary period is still open', () => {
    const pending = { ...incompleteClaim, status: 'pending', pendingMin: 30, authorisedMin: null };
    // "Today" is still inside the claim's own period (Jul16-Aug15), so it hasn't closed yet.
    const { patch, pendingCount } = buildDayImport('2026-08-02', [pending], null, '2026-07-16');
    expect(patch.appr.leg_150000_183319).toBeUndefined();
    expect(pendingCount).toBe(1);
  });
});
