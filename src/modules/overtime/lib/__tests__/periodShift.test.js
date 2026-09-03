/**
 * Regression guard: periodShift used to jump a fixed 31 days, which
 * undershot through any month with fewer than 31 days and then had
 * periodFor's own "day < 16 belongs to the previous month" rule roll it
 * back an extra period — silently skipping one on the way back through
 * February, and through any two consecutive short months. Forward never
 * showed it, because overshooting into the next month is absorbed by the
 * same rule instead of triggering it.
 */
import { describe, it, expect } from 'vitest';
import { periodFor, periodShift } from '../overtimeEngine';

describe('periodShift', () => {
  it('steps back one real period at a time across a whole year, never skipping', () => {
    let p = periodFor('2026-04-01'); // Mar 16 - Apr 15, 2026
    const labels = [p.label];
    for (let i = 0; i < 13; i++) { p = periodShift(p, -1); labels.push(p.label); }
    expect(labels).toEqual([
      'Mar 16 – Apr 15, 2026', 'Feb 16 – Mar 15, 2026', 'Jan 16 – Feb 15, 2026',
      'Dec 16 – Jan 15, 2026', 'Nov 16 – Dec 15, 2025', 'Oct 16 – Nov 15, 2025',
      'Sep 16 – Oct 15, 2025', 'Aug 16 – Sep 15, 2025', 'Jul 16 – Aug 15, 2025',
      'Jun 16 – Jul 15, 2025', 'May 16 – Jun 15, 2025', 'Apr 16 – May 15, 2025',
      'Mar 16 – Apr 15, 2025', 'Feb 16 – Mar 15, 2025',
    ]);
  });

  it('stepping forward then back the same number of times returns to the start', () => {
    const start = periodFor('2026-02-01'); // crosses the real bug's February case
    let p = start;
    for (let i = 0; i < 8; i++) p = periodShift(p, 1);
    for (let i = 0; i < 8; i++) p = periodShift(p, -1);
    expect(p).toEqual(start);
  });

  it('crosses a year boundary in one step, both directions', () => {
    expect(periodShift(periodFor('2026-01-01'), -1).label).toBe('Nov 16 – Dec 15, 2025');
    expect(periodShift(periodFor('2025-12-20'), 1).label).toBe('Jan 16 – Feb 15, 2026');
  });
});
