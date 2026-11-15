import { startOfDay } from '../../../core/dates';

export const TYPE = 'tasks.task';

export const PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];
const RANK = { high: 0, normal: 1, low: 2 };

/** Due dates are whole days, stored as local midnight. */
export const dayIso = (ymd) => (ymd ? new Date(`${ymd}T00:00:00`).toISOString() : null);
export const ymdOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : '');
export const addDays = (n, from = new Date()) => {
  const d = startOfDay(from); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA');
};

export const isLate = (t, now = new Date()) => !t.doneAt && !!t.dueAt && new Date(t.dueAt) < startOfDay(now);
export const isToday = (t, now = new Date()) => !!t.dueAt && ymdOf(t.dueAt) === now.toLocaleDateString('en-CA');

/**
 * "Pay water bill #home ! tomorrow" → title, tag, priority and date.
 * `!` (or `!!`) marks it high; a trailing today / tomorrow / tmr sets the day.
 */
export function parseQuick(text, now = new Date()) {
  let tag = '';
  let priority = 'normal';
  let due = '';
  const words = [];
  for (const w of text.trim().split(/\s+/)) {
    if (/^#\S+/.test(w) && !tag) tag = w.slice(1);
    else if (/^!+$/.test(w)) priority = 'high';
    else words.push(w);
  }
  const last = (words[words.length - 1] || '').toLowerCase();
  if (words.length > 1 && last === 'today') { due = addDays(0, now); words.pop(); }
  else if (words.length > 1 && (last === 'tomorrow' || last === 'tmr')) { due = addDays(1, now); words.pop(); }
  return { title: words.join(' '), tag, priority, due };
}

export const priorityOf = (t) => t.data?.priority || 'normal';
export const stepsOf = (t) => t.data?.steps || [];

/** High first, then soonest due (undated last), then oldest. */
export function byPriority(a, b) {
  return (RANK[priorityOf(a)] - RANK[priorityOf(b)])
    || (a.dueAt || '9').localeCompare(b.dueAt || '9')
    || (a.createdAt || '').localeCompare(b.createdAt || '');
}

/** Open tasks split the way you'd look at them; done ones newest first. */
export function groupTasks(tasks, now = new Date()) {
  const open = tasks.filter((t) => !t.doneAt);
  const todayYmd = now.toLocaleDateString('en-CA');
  const g = {
    late: open.filter((t) => isLate(t, now)),
    today: open.filter((t) => t.dueAt && ymdOf(t.dueAt) === todayYmd),
    soon: open.filter((t) => t.dueAt && ymdOf(t.dueAt) > todayYmd),
    someday: open.filter((t) => !t.dueAt),
    done: tasks.filter((t) => t.doneAt).sort((a, b) => b.doneAt.localeCompare(a.doneAt)),
  };
  for (const k of ['late', 'today', 'someday']) g[k].sort(byPriority);
  g.soon.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || byPriority(a, b));
  return g;
}

/* ------------------------- reminders on a task ------------------------- */

/**
 * A task's reminders are ordinary Reminders records linked back to it
 * (`links: [{ rel: 'task', id }]`), so they push, show in Reminders and on
 * the Dashboard like any other. Tasks only knows the type string.
 */
export const REMINDER_TYPE = 'reminders.task';

export const linksTask = (rec, taskId) => (rec.links || []).some((l) => l.rel === 'task' && l.id === taskId);
export const remindersOf = (repo, taskId) => repo.query({ type: REMINDER_TYPE }).filter((r) => linksTask(r, taskId));

/** The soonest reminder still to come for each task id. */
export function nextReminders(reminders) {
  const out = new Map();
  for (const r of reminders) {
    if (r.doneAt || !r.dueAt) continue;
    for (const l of r.links || []) {
      if (l.rel !== 'task') continue;
      const cur = out.get(l.id);
      if (!cur || r.dueAt < cur) out.set(l.id, r.dueAt);
    }
  }
  return out;
}

/** Finishing a task closes its open reminders; reopening leaves them be. */
export function setTaskDone(repo, task, done) {
  const now = new Date().toISOString();
  repo.update(task.id, { doneAt: done ? now : null });
  if (done) remindersOf(repo, task.id).filter((r) => !r.doneAt).forEach((r) => repo.update(r.id, { doneAt: now }));
}

export function deleteTask(repo, task) {
  remindersOf(repo, task.id).forEach((r) => repo.softDelete(r.id));
  repo.softDelete(task.id);
}

/**
 * Bring a task's reminders in line with the sheet: `alarms` is
 * [{ id?, at }] — no id means new. Titles follow the task's.
 */
export function syncReminders(repo, taskId, title, alarms) {
  const current = remindersOf(repo, taskId);
  const keep = new Set(alarms.filter((a) => a.id).map((a) => a.id));
  current.filter((r) => !keep.has(r.id)).forEach((r) => repo.softDelete(r.id));
  for (const a of alarms) {
    if (!a.id) {
      repo.create(REMINDER_TYPE, { title, dueAt: a.at, links: [{ rel: 'task', id: taskId }], data: { rule: null } });
      continue;
    }
    const r = current.find((x) => x.id === a.id);
    if (r && (r.title !== title || r.dueAt !== a.at)) repo.update(r.id, r.dueAt === a.at ? { title } : { title, dueAt: a.at, doneAt: null, data: { ...r.data, pushedAt: null } });
  }
}

export const tagsOf = (tasks) => [...new Set(tasks.flatMap((t) => t.tags || []).filter(Boolean))].sort();
