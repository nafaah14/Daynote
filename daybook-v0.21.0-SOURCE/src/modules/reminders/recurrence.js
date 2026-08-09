/**
 * Recurrence. Deliberately small.
 *
 * We store a rule and compute the NEXT occurrence when one is completed.
 * Future instances are never materialised — that is what keeps recurring
 * tasks from flooding the store and makes editing a series sane.
 *
 * rule: { freq: 'daily'|'weekly'|'monthly'|'yearly', interval: number, byDay?: number[] }
 */

export const FREQ_OPTIONS = [
  { value: '', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export function describeRule(rule) {
  if (!rule || !rule.freq) return null;
  const n = rule.interval || 1;
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.freq];
  return n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
}

export function nextOccurrence(fromISO, rule) {
  if (!rule || !rule.freq) return null;
  const n = rule.interval || 1;
  const d = new Date(fromISO);

  switch (rule.freq) {
    case 'daily':   d.setDate(d.getDate() + n); break;
    case 'weekly':  d.setDate(d.getDate() + 7 * n); break;
    case 'monthly': {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + n);
      // clamp: 31 Jan + 1 month lands on the last day of Feb, not 3 Mar
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, lastDay));
      break;
    }
    case 'yearly':  d.setFullYear(d.getFullYear() + n); break;
    default: return null;
  }
  return d.toISOString();
}

/**
 * If a repeating reminder was missed for a long time, don't resurface every
 * skipped occurrence — roll forward to the next one that is still ahead.
 */
export function nextFutureOccurrence(fromISO, rule, now = new Date()) {
  let next = nextOccurrence(fromISO, rule);
  let guard = 0;
  while (next && new Date(next) < now && guard++ < 500) {
    next = nextOccurrence(next, rule);
  }
  return next;
}
