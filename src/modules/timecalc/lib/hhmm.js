/**
 * hh:mm arithmetic for the Time Calc module. Everything is whole minutes.
 *
 * Input is forgiving about the colon but strict about meaning: "0800", "800"
 * and "8:00" are all 08:00, but "0875" is rejected rather than quietly
 * becoming 09:15 — a wrong total here would be copied into real paperwork.
 */

const DAY = 1440;

/**
 * Parse typed time. `clock` limits the result to a time of day (< 24:00);
 * without it the value is a duration and hours can run past 24.
 * Returns { ok: true, minutes } or { ok: false, empty?, error }.
 */
export function parseHHMM(text, { clock = false } = {}) {
  const s = String(text ?? '').trim();
  if (!s) return { ok: false, empty: true, error: '' };

  let h; let m;
  const colon = /^(\d{1,3}):(\d{2})$/.exec(s);
  if (colon) {
    h = Number(colon[1]); m = Number(colon[2]);
  } else if (/^\d+$/.test(s)) {
    if (s.length <= 2) { h = Number(s); m = 0; }
    else if (s.length === 3) { h = Number(s[0]); m = Number(s.slice(1)); }
    else if (s.length === 4) { h = Number(s.slice(0, 2)); m = Number(s.slice(2)); }
    else if (s.length === 5 && !clock) { h = Number(s.slice(0, 3)); m = Number(s.slice(3)); }
    else return { ok: false, error: 'Too many digits' };
  } else {
    return { ok: false, error: 'Use hh:mm, like 08:00 or 0800' };
  }

  if (m > 59) return { ok: false, error: 'Minutes must be under 60' };
  if (clock && h > 23) return { ok: false, error: 'Hours must be under 24' };
  return { ok: true, minutes: h * 60 + m };
}

const two = (n) => String(n).padStart(2, '0');

/** 158 -> "02:38"; hours keep growing past two digits (7500 -> "125:00"). */
export function formatHHMM(minutes) {
  const neg = minutes < 0;
  const a = Math.abs(Math.round(minutes));
  return `${neg ? '-' : ''}${two(Math.floor(a / 60))}:${two(a % 60)}`;
}

/** 158 -> "2h 38m". */
export function formatLong(minutes) {
  const neg = minutes < 0;
  const a = Math.abs(Math.round(minutes));
  return `${neg ? '-' : ''}${Math.floor(a / 60)}h ${two(a % 60)}m`;
}

/** 158 -> "2.63" (hours, two places). */
export const toDecimal = (minutes) => (minutes / 60).toFixed(2);

/**
 * Time between two clock times. A finish before the start means it ended the
 * next day (22:00 -> 01:30 is 3h 30m); the flag lets the screen say so
 * instead of guessing silently. Equal times are zero, not 24 hours.
 */
export function worked(startMin, endMin) {
  const nextDay = endMin < startMin;
  return { minutes: (endMin - startMin + DAY) % DAY, nextDay };
}

export const sumMinutes = (list) => list.reduce((t, x) => t + (Number.isFinite(x) ? x : 0), 0);

/** Running total after each entry (blank/invalid entries add nothing). */
export function runningTotals(list) {
  let t = 0;
  return list.map((x) => { t += Number.isFinite(x) ? x : 0; return t; });
}

/** Index of the first entry whose running total reaches `target`, or -1. */
export function crossingIndex(list, target) {
  const totals = runningTotals(list);
  return totals.findIndex((t, i) => Number.isFinite(list[i]) && t >= target);
}
