import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BellRing, Repeat, Eraser, CheckSquare, AlarmClock, X } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, Row, SectionLabel, EmptyState, Button, Sheet, Field, Input, Select, Chip, CompleteButton, OptionRow, Toggle,
} from '../../core/ui/components';
import { dueLabel, isOverdue, endOfToday } from '../../core/dates';
import { PinMenu, Fab } from '../../core/ui/extras';
import { registerProvider, isOnAgendaDay } from '../../core/dashboardRegistry';
import './reminders.css';
import { FREQ_OPTIONS, describeRule, nextFutureOccurrence } from './recurrence';
import { alarmRinging, clockIntent, snoozedData, stoppedData } from './alarm';

const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export const TYPE = 'reminders.task';

/* A reminder can belong to a task (Tasks module) through `links`; only the
   type string is shared, never code. */
const TASK_TYPE = 'tasks.task';
const taskOf = (repo, rec) => {
  const l = (rec?.links || []).find((x) => x.rel === 'task');
  const t = l && repo.get(l.id);
  return t && !t.deletedAt ? t : null;
};

/* ------------------------------ quick picks ----------------------------- */

const toDateInput = (d) => d.toLocaleDateString('en-CA'); // matches the <input type="date"> value format

/** The next occurrence of a weekday strictly after today — so "Friday" on a
 *  Friday means next week's, not today's (which "Today" already covers). */
function nextWeekday(targetDow) {
  const d = new Date();
  const diff = (targetDow - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

const DATE_PICKS = [
  { label: 'Today', value: () => toDateInput(new Date()) },
  { label: 'Tomorrow', value: () => { const d = new Date(); d.setDate(d.getDate() + 1); return toDateInput(d); } },
  { label: 'Friday', value: () => toDateInput(nextWeekday(5)) },
  { label: 'Sunday', value: () => toDateInput(nextWeekday(0)) },
];

const TIME_PICKS = [
  { label: '8am', value: '08:00' },
  { label: '12pm', value: '12:00' },
  { label: '3pm', value: '15:00' },
  { label: '8pm', value: '20:00' },
];

/** A row of Chip buttons that set a field to a preset value — the field
 *  itself (the <Input> passed as children) stays right below for anyone who
 *  wants a date/time the presets don't cover. */
function QuickPicks({ picks, value, onPick }) {
  return (
    <div className="quick-picks">
      {picks.map((p) => {
        const v = typeof p.value === 'function' ? p.value() : p.value;
        return (
          <Chip key={p.label} tone={value === v ? 'in' : 'neutral'} onClick={() => onPick(v)}>
            {p.label}
          </Chip>
        );
      })}
    </div>
  );
}

/* --------------------------------- edit -------------------------------- */

export function ReminderSheet({ open, onClose, existing }) {
  const repo = useRepo();
  const [title, setTitle] = useState(existing?.title || '');
  const [dueDate, setDueDate] = useState(() => {
    if (!existing?.dueAt) return '';
    return new Date(existing.dueAt).toLocaleDateString('en-CA'); // YYYY-MM-DD
  });
  const [dueTime, setDueTime] = useState(() => {
    if (!existing?.dueAt) return '';
    const d = new Date(existing.dueAt);
    return d.getHours() || d.getMinutes()
      ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
      : '';
  });
  const [freq, setFreq] = useState(existing?.data?.rule?.freq || '');
  const [interval, setInterval] = useState(existing?.data?.rule?.interval || 1);
  const [home, setHome] = useState(existing?.home || 'auto');
  const nav = useNavigate();
  const task = taskOf(repo, existing);
  const [asTask, setAsTask] = useState(false);
  const [alarm, setAlarm] = useState(!!existing?.data?.alarm);

  /** Show the weekday name next to the date picker so you know which day
   *  you've picked without counting in your head. */
  const dayName = (() => {
    if (!dueDate) return null;
    try {
      return new Date(dueDate + 'T12:00').toLocaleDateString([], { weekday: 'long' });
    } catch { return null; }
  })();

  const save = () => {
    if (!title.trim()) return;
    const rule = freq ? { freq, interval: Number(interval) || 1 } : null;
    let dueAt = null;
    if (dueDate) {
      const dt = dueTime ? new Date(`${dueDate}T${dueTime}`) : new Date(`${dueDate}T00:00`);
      if (!isNaN(dt)) dueAt = dt.toISOString();
    }
    const data = { rule, alarm: alarm && !!dueTime };
    // Same date and time: keep what was already sent / stopped / snoozed, so
    // fixing the title doesn't push or ring it again.
    if (existing && existing.dueAt === dueAt) {
      for (const k of ['pushedAt', 'alarmStopped', 'alarmSnoozeUntil', 'alarmSnoozePushed', 'lastDoneAt']) {
        if (existing.data?.[k] != null) data[k] = existing.data[k];
      }
    }
    const patch = { title: title.trim(), dueAt, home, data };
    if (asTask && !task) {
      const t = repo.create(TASK_TYPE, {
        title: title.trim(), dueAt: dueDate ? new Date(`${dueDate}T00:00`).toISOString() : null,
        data: { priority: 'normal', steps: [] },
      });
      patch.links = [...(existing?.links || []), { rel: 'task', id: t.id }];
    }
    if (existing) repo.update(existing.id, patch);
    else repo.create(TYPE, patch);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit reminder' : 'New reminder'}
      headerActions={<PinMenu value={home} onChange={setHome} autoLabel="due or overdue" />}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>
            {existing ? 'Save changes' : 'Add reminder'}
          </Button>
        </>
      }
    >
      <Field label="What">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Renew vehicle registration" autoFocus />
      </Field>
      <Field label="Date" hint={dayName ? `That's a ${dayName}.` : 'Leave empty to keep it undated.'}>
        <QuickPicks picks={DATE_PICKS} value={dueDate} onPick={setDueDate} />
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      {dueDate && (
        <Field label="Time" hint="Optional — leave blank for an all-day reminder.">
          <QuickPicks picks={TIME_PICKS} value={dueTime} onPick={setDueTime} />
          <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        </Field>
      )}
      {dueDate && dueTime && (
        <>
          <OptionRow
            icon={AlarmClock}
            title="Ring as an alarm"
            hint="Rings loudly with Daybook open, until you stop or snooze it. With Daybook closed, the notification stays on screen until you act on it."
            control={<Toggle checked={alarm} onChange={setAlarm} label="Ring as an alarm" />}
          />
          {isAndroid() && (
            <a className="rem-clock" href={clockIntent({
              hour: Number(dueTime.slice(0, 2)),
              minute: Number(dueTime.slice(3, 5)),
              message: title.trim(),
              fallback: `${window.location.origin}/reminders?clock=0`,
            })}>
              <AlarmClock size={14} /> Also set it in the phone's Clock app
            </a>
          )}
        </>
      )}
      <Field label="Repeats">
        <Select value={freq} onChange={(e) => setFreq(e.target.value)}>
          {FREQ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      {freq && (
        <Field label="Every" hint={describeRule({ freq, interval })}>
          <Input type="number" min="1" value={interval} onChange={(e) => setInterval(e.target.value)} />
        </Field>
      )}
      {task ? (
        <div className="rem-task">
          <CheckSquare size={15} />
          <span>Part of the task <strong>{task.title}</strong>{task.doneAt ? ' (done)' : ''}</span>
          <Button size="sm" onClick={() => { onClose(); nav(`/tasks?task=${task.id}`); }}>Open task</Button>
        </div>
      ) : (
        <OptionRow
          title="Also add to Tasks"
          hint="Makes a task for it, with this reminder attached."
          control={<Toggle checked={asTask} onChange={setAsTask} label="Also add to Tasks" />}
        />
      )}
      {existing && (
        <Button variant="danger" size="sm" onClick={() => { repo.softDelete(existing.id); onClose(); }}>
          Delete reminder
        </Button>
      )}
    </Sheet>
  );
}

/** The editor as the registry wants it: (record|null, close) => node. */
export const renderEditor = (record, close) => (
  <ReminderSheet open onClose={close} existing={record || undefined} />
);

/* -------------------------------- actions ------------------------------ */

/** Completing a repeating reminder rolls it forward instead of closing it. */
export function completeReminder(repo, rec) {
  const rule = rec.data?.rule;
  if (rule?.freq && rec.dueAt) {
    const next = nextFutureOccurrence(rec.dueAt, rule);
    // The next date is a fresh one: it pushes and rings again.
    repo.update(rec.id, { dueAt: next, doneAt: null, data: { ...rec.data, lastDoneAt: new Date().toISOString(), pushedAt: null, alarmSnoozeUntil: null, alarmSnoozePushed: null } });
  } else {
    repo.update(rec.id, { doneAt: rec.doneAt ? null : new Date().toISOString() });
  }
}

const isDue = (rec) => !rec.doneAt && !!rec.dueAt && rec.dueAt <= endOfToday();

export function ReminderRow({ rec, onEdit }) {
  const repo = useRepo();
  const rule = describeRule(rec.data?.rule);
  const overdue = isOverdue(rec.dueAt) && !rec.doneAt;
  const due = isDue(rec);
  const task = taskOf(repo, rec);

  return (
    <Row
      accent={overdue ? 'var(--out)' : 'var(--accent-reminders)'}
      wash={due}
      title={rec.title}
      dim={!!rec.doneAt}
      onClick={onEdit}
      meta={
        <>
          {rec.dueAt && (
            <span className={overdue ? 'due-over mono' : 'mono'}>{dueLabel(rec.dueAt)}</span>
          )}
          {rec.data?.alarm && <Chip tone="neutral"><AlarmClock size={10} /> Alarm</Chip>}
          {rule && <Chip tone="neutral"><Repeat size={10} /> {rule}</Chip>}
          {task && <Chip tone="neutral"><CheckSquare size={10} /> {task.title === rec.title ? 'Task' : task.title}</Chip>}
        </>
      }
      right={<CompleteButton completed={!!rec.doneAt} onToggle={() => completeReminder(repo, rec)} label="Complete" />}
    />
  );
}

/* -------------------------------- screen ------------------------------- */

export function RemindersScreen() {
  const repo = useRepo();
  const [editing, setEditing] = useState(undefined);
  const [params, setParams] = useSearchParams();

  const all = repo.query({ type: TYPE });
  const open = all.filter((r) => !r.doneAt);
  const overdue = open.filter((r) => isOverdue(r.dueAt));
  const upcoming = open.filter((r) => r.dueAt && !isOverdue(r.dueAt));
  const undated = open.filter((r) => !r.dueAt);
  const done = all.filter((r) => r.doneAt).slice(-15).reverse();

  // Clearing a done reminder soft-deletes it. Repeating reminders never land
  // here (completing them rolls the date forward instead), so this only ever
  // removes genuinely finished one-off reminders.
  const clearDone = () => done.forEach((r) => repo.softDelete(r.id));

  const group = (label, rows, right) => rows.length > 0 && (
    <>
      <SectionLabel right={right ?? <span className="mono count">{rows.length}</span>}>{label}</SectionLabel>
      <Card><div className="ruled">{rows.map((r) => <ReminderRow key={r.id} rec={r} onEdit={() => setEditing(r)} />)}</div></Card>
    </>
  );

  return (
    <div className="page has-fab">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Reminders</h1>
          <p className="page-sub">Things that come and find you at a time.</p>
        </div>
      </div>

      {params.get('clock') === '0' && (
        <div className="rem-notice" role="status">
          <span>The phone didn't let Daybook open the Clock app — set that alarm in Clock by hand. The reminder's own alarm still works.</span>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setParams({}, { replace: true })}><X size={16} /></button>
        </div>
      )}

      {open.length === 0 && done.length === 0 ? (
        <Card>
          <EmptyState
            icon={BellRing}
            title="Nothing to remember"
            body="Add something you don't want to carry in your head."
            action={<Button variant="outline" size="sm" onClick={() => setEditing(null)}>Add a reminder</Button>}
          />
        </Card>
      ) : (
        <>
          {group('Overdue', overdue)}
          {group('Coming up', upcoming)}
          {group('No date', undated)}
          {group('Recently done', done,
            <Button size="sm" variant="quiet" onClick={clearDone}><Eraser size={13} /> Clear</Button>
          )}
        </>
      )}

      {editing !== undefined && (
        <ReminderSheet open onClose={() => setEditing(undefined)} existing={editing || undefined} />
      )}

      <Fab label="New reminder" onClick={() => setEditing(null)} />
    </div>
  );
}

/* ------------------------------ dashboard ------------------------------- */

const toDashboardItem = (r) => ({
  id: r.id, title: r.title, type: 'reminders',
  dueDate: r.dueAt, pinned: r.home === 'pinned',
  completed: !!r.doneAt, completedAt: r.doneAt,
  record: r,
});

registerProvider({
  id: 'reminders',
  getItemsForDate: (date, repo) => repo.query({ type: TYPE })
    .filter((r) => isOnAgendaDay(r.dueAt, !!r.doneAt, date))
    .map(toDashboardItem),
  getPinnedItems: (repo) => repo.query({ type: TYPE })
    .filter((r) => r.home === 'pinned')
    .map(toDashboardItem),
  togglePin: (repo, item) => repo.update(item.id, { home: item.pinned ? 'auto' : 'pinned' }),
  // Goes through completeReminder, not a bare doneAt write — a recurring
  // reminder rolls its date forward instead of ever being marked done.
  toggleComplete: (repo, item) => completeReminder(repo, item.record),
});

/* ------------------------------- manifest ------------------------------ */

export default {
  id: 'reminders',
  title: 'Reminders',
  icon: BellRing,
  accent: 'var(--accent-reminders)',
  tier: 'integrated',
  routes: [{ path: '/reminders', element: <RemindersScreen /> }],

  renderRef: (record) => <span className="ref-chip">{record.title}</span>,

  search: ({ repo }, q) =>
    repo.query({ type: TYPE })
      .filter((r) => r.title.toLowerCase().includes(q))
      .map((r) => ({ id: r.id, title: r.title, sub: 'Reminder', to: '/reminders' })),

  quickActions: [{ id: 'new-reminder', label: 'New reminder', icon: BellRing, to: '/reminders' }],

  // Opt-in: a module declares its own notification categories. The settings
  // page reads these — nothing central needs to know reminders exist.
  /** Feed the in-app notification centre. Core has no idea what a reminder
   *  is — this is the module telling it what matters. */
  raiseEvents: ({ repo }) => {
    const now = new Date().toISOString();
    const due = repo.query({ type: TYPE, done: false, dueBefore: now });
    const events = due.map((r) => ({
      title: r.data?.alarm ? 'Alarm' : 'Reminder due',
      body: r.title,
      url: r.data?.alarm ? `/reminders?alarm=${r.id}` : '/reminders',
      kind: 'reminder',
      alarm: !!r.data?.alarm,
      // one event per reminder per due date, so re-opening the app is quiet
      dedupeKey: `reminder:${r.id}:${r.dueAt}`,
    }));
    // A snoozed alarm notifies again when its snooze ends.
    repo.query({ type: TYPE, done: false })
      .filter((r) => r.data?.alarm && r.data.alarmSnoozeUntil && r.data.alarmSnoozeUntil <= now && alarmRinging(r))
      .forEach((r) => events.push({
        title: 'Alarm', body: r.title, url: `/reminders?alarm=${r.id}`, kind: 'reminder', alarm: true,
        dedupeKey: `alarm:${r.id}:${r.data.alarmSnoozeUntil}`,
      }));
    return events;
  },

  /** What rings right now (core's AlarmHost shows it full-screen). */
  alarms: ({ repo, now }) => repo.query({ type: TYPE, done: false })
    .filter((r) => alarmRinging(r, now))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .map((r) => ({
      key: `${r.id}:${r.dueAt}:${r.data.alarmSnoozeUntil || ''}`,
      id: r.id,
      title: r.title,
      when: r.data.alarmSnoozeUntil && r.data.alarmSnoozeUntil > r.dueAt ? r.data.alarmSnoozeUntil : r.dueAt,
      stop: () => repo.update(r.id, { data: stoppedData(r) }),
      snooze: (min) => repo.update(r.id, { data: snoozedData(r, min) }),
      done: () => completeReminder(repo, { ...r, data: stoppedData(r) }),
    })),

  notifications: [
    { id: 'reminders.due', label: 'Due reminders', hint: 'When a reminder becomes due.', default: true },
    { id: 'reminders.overdue', label: 'Overdue nudges', hint: 'A daily nudge while something stays overdue.', default: false },
  ],
};
