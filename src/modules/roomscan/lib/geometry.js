/**
 * RoomScan geometry — pure functions on plain data, no Three.js, no DOM.
 *
 * Units are metres. Points are { x, y, z } with y up, matching WebXR and
 * Three.js; the floor plan uses x and z.
 */

/** Straight-line distance between two 3D points. */
export function dist3(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/** Distance across the floor, ignoring height (x/z only). */
export function distFloor(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Lengths of each step along a path of points: [p0→p1, p1→p2, …]. */
export function segments(points, d = dist3) {
  const out = [];
  for (let i = 1; i < points.length; i++) out.push(d(points[i - 1], points[i]));
  return out;
}

/** Total length of a path. */
export function pathLength(points, d = dist3) {
  return segments(points, d).reduce((s, n) => s + n, 0);
}

/** "1.234 m" over a metre, "45.6 cm" under, so a tape check reads to the mm. */
export function formatLength(m) {
  if (!Number.isFinite(m)) return '—';
  return m >= 1 ? `${m.toFixed(3)} m` : `${(m * 100).toFixed(1)} cm`;
}

/** Hits closer than this to the camera are noisy (WebXR hit-test, ARCore). */
export const MIN_HIT_RANGE = 0.4;

/** A hit is usable once it's far enough from the camera. */
export function hitUsable(hit, camera, min = MIN_HIT_RANGE) {
  return !!hit && !!camera && dist3(hit, camera) >= min;
}

/**
 * How far a measurement is from a known length, for the tape test:
 * { diff (m, signed), pct (signed %), ok (within tol, default ±2 cm) }.
 */
export function tapeCheck(measured, actual, tol = 0.02) {
  const diff = measured - actual;
  return { diff, pct: actual ? (diff / actual) * 100 : 0, ok: Math.abs(diff) <= tol };
}
