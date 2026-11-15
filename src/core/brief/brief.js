import { startOfDay } from '../dates';

/**
 * The morning brief: one look at everything that needs you today.
 *
 * Built from what modules already tell core — their Dashboard providers
 * (due and overdue items) and their notification events — so a module that
 * feeds the day agenda or the bell shows up here with no extra wiring.
 */

export const BRIEF_DEFAULTS = { enabled: true, from: 5, until: 12 };
export const OPEN_BRIEF = 'daybook:brief'; // window event: open the brief now

export const ymd = (d) => d.toLocaleDateString('en-CA');

/** First open of the day, inside the morning window. */
export function briefDue(prefs, now, seen) {
  const b = { ...BRIEF_DEFAULTS, ...prefs };
  if (!b.enabled || seen === ymd(now)) return false;
  const h = now.getHours();
  return h >= b.from && h < b.until;
}

/** A reminder that belongs to a task listed alongside it is shown as the task. */
function dropLinked(items) {
  const ids = new Set(items.map((i) => i.id));
  return items.filter((i) => !(i.record?.links || []).some((l) => l.rel === 'task' && ids.has(l.id)));
}

/**
 * itemsFor(date) → Dashboard items for that day (overdue roll onto today);
 * events → unread notification events. Events about an item already listed
 * (their dedupeKey names its id) are left out, so nothing shows twice.
 */
export function buildBrief({ itemsFor, events }, now = new Date(), ahead = 2) {
  const dayStart = startOfDay(now).toISOString();
  const open = (list) => dropLinked(list.filter((i) => !i.completed));

  const todays = open(itemsFor(now));
  const late = todays.filter((i) => i.dueDate && i.dueDate < dayStart)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const today = todays.filter((i) => !late.includes(i));

  const listed = new Set(todays.map((i) => i.id));
  const soon = [];
  for (let n = 1; n <= ahead; n++) {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    for (const i of open(itemsFor(d))) {
      if (!listed.has(i.id)) { listed.add(i.id); soon.push(i); }
    }
  }

  const ids = [...listed];
  const notices = events.filter((e) => !ids.some((id) => e.data?.dedupeKey?.includes(id)));
  return { late, today, soon, notices, count: late.length + today.length + notices.length };
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
