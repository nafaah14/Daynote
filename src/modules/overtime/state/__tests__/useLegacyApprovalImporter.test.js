/**
 * Regression guard for a real bug: Mohamed Salah was imported under an
 * earlier parser that wrongly classified 9 "incomplete-hours-bg" claims as
 * approved, writing `appr[id] = { app: true, ... }` directly (no `src`
 * stamp — that field didn't exist yet). Re-importing him with the fixed
 * parser changed nothing, because "never overwrite an existing decision"
 * couldn't tell that stale entry apart from a supervisor's real approve.
 * `buildDayImport` must now redecide anything it stamped itself, while
 * still never touching a decision without that stamp — unless the caller
 * explicitly says to, via `mode`.
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

  it('never touches a decision a person actually made (no src stamp), and reports it as a conflict', () => {
    const supervisorApproved = { appr: { leg_150000_183319: { app: true, appMin: 213 } } };
    const { patch, conflicts } = buildDayImport('2026-08-02', [incompleteClaim], supervisorApproved, '2026-08-16');
    expect(patch.appr.leg_150000_183319).toEqual({ app: true, appMin: 213 });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ date: '2026-08-02', existing: 'approved, 3h 33m', fromFile: 'held at 3h 30m' });
  });

  it('mode "force" lets HRMS win over a hand-made approval, so a person can get back to a clean match', () => {
    const supervisorApproved = { appr: { leg_150000_183319: { app: true, appMin: 213 } } };
    const { patch, conflicts, pendingCount } =
      buildDayImport('2026-08-02', [incompleteClaim], supervisorApproved, '2026-08-16', 'force');
    expect(patch.appr.leg_150000_183319).toBeUndefined(); // HRMS never pays this, so it goes back to held
    expect(conflicts).toHaveLength(0);
    expect(pendingCount).toBe(1);
  });

  it('mode "replace" ignores existing data entirely, including fields a per-claim merge would never touch', () => {
    const staleV1 = {
      // The exact shape found stuck on real historical data: pre-manualRecs
      // flat fields from an importer version that predates appr/manualRecs
      // entirely, plus an unrelated manual entry that should also go.
      legacyApprovedMin: 90, legacyClaims: [{ date: '2026-08-02' }],
      manualRecs: [{ id: 'man_hand_added', s: '20:00', e: '21:00', min: 60 }],
      appr: {},
    };
    const { patch } = buildDayImport('2026-08-02', [incompleteClaim], staleV1, '2026-08-16', 'replace');
    expect(patch.legacyApprovedMin).toBeNull();
    expect(patch.legacyClaims).toBeNull();
    expect(patch.manualRecs.find((r) => r.id === 'man_hand_added')).toBeUndefined();
    expect(patch.manualRecs).toHaveLength(1); // only this file's one claim
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
