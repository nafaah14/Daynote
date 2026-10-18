/**
 * Persisted state for Time Calc: kept in localStorage until the user clears
 * it. Lines hold the text as typed/normalised (not minutes), so what is on
 * screen after a reload is exactly what was there before.
 */

export const STORE_KEY = 'daybook.timecalc.v1';
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DEFAULT_TARGET = '48:00';

let seq = 0;
const newId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export const blankWorked = () => ({ id: newId(), label: '', start: '', end: '' });
export const blankHour = (label = '') => ({ id: newId(), label, value: '' });
export const weekOfHours = () => DAYS.map((d) => blankHour(d));

export function initialState() {
  return { tab: 'worked', worked: [blankWorked()], hours: weekOfHours(), target: DEFAULT_TARGET };
}

const str = (v) => (typeof v === 'string' ? v : '');

/** Accept whatever is in storage, keep what's usable, fall back for the rest. */
export function sanitize(raw) {
  const base = initialState();
  if (!raw || typeof raw !== 'object') return base;
  const worked = Array.isArray(raw.worked)
    ? raw.worked.filter((x) => x && typeof x === 'object')
      .map((x) => ({ id: str(x.id) || newId(), label: str(x.label), start: str(x.start), end: str(x.end) }))
    : null;
  const hours = Array.isArray(raw.hours)
    ? raw.hours.filter((x) => x && typeof x === 'object')
      .map((x) => ({ id: str(x.id) || newId(), label: str(x.label), value: str(x.value) }))
    : null;
  return {
    tab: raw.tab === 'hours' ? 'hours' : 'worked',
    worked: worked && worked.length ? worked : base.worked,
    hours: hours && hours.length ? hours : base.hours,
    target: str(raw.target) || DEFAULT_TARGET,
  };
}

export function loadState(storage = globalThis.localStorage) {
  try { return sanitize(JSON.parse(storage.getItem(STORE_KEY) || 'null')); } catch { return initialState(); }
}

export function saveState(state, storage = globalThis.localStorage) {
  try { storage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* not persisted */ }
}

/** Drop a worked-time result into the hours list: first empty line, else a new one. */
export function sendToHours(hours, label, value) {
  const i = hours.findIndex((h) => !h.value.trim());
  if (i >= 0) return hours.map((h, j) => (j === i ? { ...h, label: label || h.label, value } : h));
  return [...hours, { id: newId(), label: label || DAYS[hours.length % 7], value }];
}
