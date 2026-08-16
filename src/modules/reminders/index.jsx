import { useState } from 'react';
import { BellRing, Repeat, Eraser } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, Row, SectionLabel, EmptyState, Button, Sheet, Field, Input, Select, Checkbox, Chip,
} from '../../core/ui/components';
import { dueLabel, isOverdue, endOfToday } from '../../core/dates';
import { HomeVisibility, Fab } from '../../core/ui/extras';
import { FREQ_OPTIONS, describeRule, nextFutureOccurrence } from './recurrence';

export const TYPE = 'reminders.task';

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
    const patch = { title: title.trim(), dueAt, home, data: { rule } };
    if (existing) repo.update(existing.id, patch);
    else repo.create(TYPE, patch);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit reminder' : 'New reminder'}
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
      <HomeVisibility
        value={home}
        onChange={setHome}
        autoHint="Appears on Today when it's due or overdue."
      />
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
    repo.update(rec.id, { dueAt: next, doneAt: null, data: { ...rec.data, lastDoneAt: new Date().toISOString() } });
  } else {
    repo.update(rec.id, { doneAt: rec.doneAt ? null : new Date().toISOString() });
  }
}

export function ReminderRow({ rec, onEdit }) {
  const repo = useRepo();
  const rule = describeRule(rec.data?.rule);
  const overdue = isOverdue(rec.dueAt) && !rec.doneAt;

  return (
    <Row
      accent={overdue ? 'var(--out)' : 'var(--accent-reminders)'}
      lead={<Checkbox checked={!!rec.doneAt} onChange={() => completeReminder(repo, rec)} label={`Complete ${rec.title}`} />}
      title={rec.title}
      muted={!!rec.doneAt}
      onClick={onEdit}
      meta={
        <>
          {rec.dueAt && (
            <span className={overdue ? 'due-over mono' : 'mono'}>{dueLabel(rec.dueAt)}</span>
          )}
          {rule && <Chip tone="neutral"><Repeat size={10} /> {rule}</Chip>}
        </>
      }
    />
  );
}

/* -------------------------------- screen ------------------------------- */

export function RemindersScreen() {
  const repo = useRepo();
  const [editing, setEditing] = useState(undefined);

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

/* ------------------------------- manifest ------------------------------ */

export default {
  id: 'reminders',
  title: 'Reminders',
  icon: BellRing,
  accent: 'var(--accent-reminders)',
  tier: 'integrated',
  routes: [{ path: '/reminders', element: <RemindersScreen /> }],

  today: ({ repo }) => {
    const open = repo.query({ type: TYPE, done: false });
    const due = open.filter((r) => r.dueAt && r.dueAt <= endOfToday() && r.home !== 'hidden');
    // Pinned reminders belong in this same group rather than a separate
    // catch-all, so they keep their checkbox, due date and recurrence chip
    // instead of collapsing to a bare title.
    const pinned = open.filter((r) => r.home === 'pinned' && !due.some((d) => d.id === r.id));
    const records = [...pinned, ...due];
    if (!records.length) return [];
    return [{
      id: 'reminders-due',
      priority: 10,
      label: due.some((r) => isOverdue(r.dueAt)) ? 'Due & overdue' : 'Due today',
      render: (r) => <ReminderRow key={r.id} rec={r} />,
      records,
    }];
  },

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
    const due = repo.query({ type: TYPE, done: false, dueBefore: new Date().toISOString() });
    return due.map((r) => ({
      title: 'Reminder due',
      body: r.title,
      url: '/reminders',
      kind: 'reminder',
      // one event per reminder per due date, so re-opening the app is quiet
      dedupeKey: `reminder:${r.id}:${r.dueAt}`,
    }));
  },

  notifications: [
    { id: 'reminders.due', label: 'Due reminders', hint: 'When a reminder becomes due.', default: true },
    { id: 'reminders.overdue', label: 'Overdue nudges', hint: 'A daily nudge while something stays overdue.', default: false },
  ],
};
