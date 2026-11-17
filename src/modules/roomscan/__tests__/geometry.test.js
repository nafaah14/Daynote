import { describe, it, expect } from 'vitest';
import { dist3, distFloor, segments, pathLength, formatLength, hitUsable, tapeCheck } from '../lib/geometry';

const p = (x, y, z) => ({ x, y, z });

describe('distances', () => {
  it('measures in 3D and across the floor', () => {
    expect(dist3(p(0, 0, 0), p(3, 0, 4))).toBe(5);
    expect(dist3(p(0, 0, 0), p(0, 2, 0))).toBe(2);
    expect(distFloor(p(0, 0, 0), p(3, 2, 4))).toBe(5);
  });

  it('splits a path into steps and adds them up', () => {
    const path = [p(0, 0, 0), p(1, 0, 0), p(1, 0, 2)];
    expect(segments(path)).toEqual([1, 2]);
    expect(pathLength(path)).toBe(3);
    expect(segments([p(0, 0, 0)])).toEqual([]);
  });
});

describe('formatLength', () => {
  it('reads to the millimetre', () => {
    expect(formatLength(1.0034)).toBe('1.003 m');
    expect(formatLength(0.4567)).toBe('45.7 cm');
    expect(formatLength(NaN)).toBe('—');
  });
});

describe('hitUsable', () => {
  it('ignores hits right in front of the camera', () => {
    const cam = p(0, 1.5, 0);
    expect(hitUsable(p(0, 1.3, -0.1), cam)).toBe(false);
    expect(hitUsable(p(0, 0, -1), cam)).toBe(true);
    expect(hitUsable(null, cam)).toBe(false);
  });
});

describe('tapeCheck', () => {
  it('passes within ±2 cm', () => {
    expect(tapeCheck(1.015, 1).ok).toBe(true);
    const off = tapeCheck(0.97, 1);
    expect(off.ok).toBe(false);
    expect(off.diff).toBeCloseTo(-0.03);
    expect(off.pct).toBeCloseTo(-3);
  });
});
