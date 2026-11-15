import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckSquare, Trash2, X, Flag, ListTodo, BellRing } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, Row, SectionLabel, EmptyState, Button, Sheet, Field, Input, Select, Textarea, Chip, CompleteButton, Checkbox,
} from '../../core/ui/components';
import { dueLabel } from '../../core/dates';
import { Fab } from '../../core/ui/extras';
import { registerProvider, isOnAgendaDay } from '../../core/dashboardRegistry';
import {
  TYPE, PRIORITIES, dayIso, ymdOf, addDays, isLate, parseQuick, priorityOf, stepsOf, groupTasks, tagsOf,
  REMINDER_TYPE, remindersOf, nextReminders, setTaskDone, deleteTask, syncReminders,
} from './lib/tasks';
import './tasks.css';

const newStepId = () => Math.random().toString(36).slice(2, 10);
const toggleDone = (repo, t) => setTaskDone(repo, t, !t.doneAt);

const atTime = (ymd, hm) => new Date(`${ymd}T${hm}`).toISOString();
const inputTime = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Remind-me presets, given the task's due day (if any). */
function alarmPicks(due) {
  const soon = new Date(Date.now() + 60 * 60 * 1000);
  return [
    { label: 'In 1 hour', at: soon.toISOString() },
    { label: 'This evening', at: atTime(addDays(0), '18:00') },
    { label: 'Tomorrow 9am', at: atTime(addDays(1), '09:00') },
    ...(due ? [
      { label: 'Day before', at: atTime(addDays(-1, new Date(`${due}T00:00`)), '09:00') },
      { label: 'Due day 8am', at: atTime(due, '08:00') },
    ] : []),
  ].filter((p) => p.at > new Date().toISOString());
}

/** The task's reminders: presets, any date/time, and the ones already set. */
function RemindMe({ alarms, setAlarms, due }) {
  const [day, setDay] = useState(due || addDays(0));
  const [time, setTime] = useState(inputTime(new Date(Date.now() + 60 * 60 * 1000)).slice(0, 3) + '00');
  const add = (at) => {
    if (!at || alarms.some((a) => a.at === at)) return;
    setAlarms([...alarms, { at }].sort((a, b) => a.at.localeCompare(b.at)));
  };
  return (
    <Field label="Remind me" hint="Sent like any reminder, and listed in Reminders too.">
      {alarms.length > 0 && (
        <div className="tk-steps">
          {alarms.map((a, i) => (
            <div key={a.id || a.at} className={`tk-step ${a.done ? 'is-done' : ''}`}>
              <BellRing size={14} className="tk-bell" />
              <span className="mono">{dueLabel(a.at)}</span>
              <button type="button" className="icon-btn" aria-label="Remove reminder" title="Remove"
                onClick={() => setAlarms(alarms.filter((_, j) => j !== i))}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="quick-picks">
        {alarmPicks(due).map((p) => <Chip key={p.label} onClick={() => add(p.at)}>{p.label}</Chip>)}
      </div>
      <div className="tk-step-add">
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Reminder date" />
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Reminder time" />
        <Button size="sm" onClick={() => day && time && add(atTime(day, time))} disabled={!day || !time}>Add</Button>
      </div>
    </Field>
  );
}

const DATE_PICKS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'Next week', days: 7 },
];

/* --------------------------------- edit -------------------------------- */

function TaskSheet({ existing, tags, onClose }) {
  const repo = useRepo();
  const [title, setTitle] = useState(existing?.title || '');
  const [due, setDue] = useState(ymdOf(existing?.dueAt));
  const [priority, setPriority] = useState(existing ? priorityOf(existing) : 'normal');
  const [tag, setTag] = useState(existing?.tags?.[0] || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [steps, setSteps] = useState(existing ? stepsOf(existing) : []);
  const [step, setStep] = useState('');
  const [alarms, setAlarms] = useState(() => (existing ? remindersOf(repo, existing.id) : [])
    .map((r) => ({ id: r.id, at: r.dueAt, done: !!r.doneAt })).filter((a) => a.at)
    .sort((a, b) => a.at.localeCompare(b.at)));

  const addStep = () => {
    const s = step.trim();
    if (!s) return;
    setSteps([...steps, { id: newStepId(), text: s, done: false }]);
    setStep('');
  };

  const save = () => {
    if (!title.trim()) return;
    const fields = {
      title: title.trim(), dueAt: dayIso(due), notes, tags: tag.trim() ? [tag.trim()] : [],
      data: { ...existing?.data, priority, steps },
    };
    const id = existing ? (repo.update(existing.id, fields), existing.id) : repo.create(TYPE, fields).id;
    syncReminders(repo, id, fields.title, alarms);
    onClose();
  };

  const remove = () => {
    deleteTask(repo, existing);
    onClose();
  };

  return (
    <Sheet
      open onClose={onClose} title={existing ? 'Edit task' : 'New task'}
      footer={
        <>
          {existing && (
            <button className="icon-btn danger" aria-label="Delete task" title="Delete (it goes to Trash)" onClick={remove}>
              <Trash2 size={16} />
            </button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>{existing ? 'Save' : 'Add task'}</Button>
        </>
      }
    >
      <Field label="Task">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Renew passport" autoFocus={!existing}
          onKeyDown={(e) => e.key === 'Enter' && save()} />
      </Field>
      <Field label="Due">
        <div className="quick-picks">
          {DATE_PICKS.map((p) => {
            const v = addDays(p.days);
            return <Chip key={p.label} tone={due === v ? 'in' : 'neutral'} onClick={() => setDue(due === v ? '' : v)}>{p.label}</Chip>;
          })}
          {due && <Chip onClick={() => setDue('')}>No date</Chip>}
        </div>
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
      </Field>
      <div className="tk-pair">
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label="Tag">
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Home, car…" list="tk-tags" />
          <datalist id="tk-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
      </div>
      <Field label="Steps">
        {steps.length > 0 && (
          <div className="tk-steps">
            {steps.map((s, i) => (
              <div key={s.id} className={`tk-step ${s.done ? 'is-done' : ''}`}>
                <Checkbox checked={s.done} label={s.text}
                  onChange={(v) => setSteps(steps.map((x, j) => (j === i ? { ...x, done: v } : x)))} />
                <span>{s.text}</span>
                <button type="button" className="icon-btn" aria-label={`Remove ${s.text}`} title="Remove"
                  onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="tk-step-add">
          <Input value={step} onChange={(e) => setStep(e.target.value)} placeholder="Add a step"
            onKeyDown={(e) => e.key === 'Enter' && addStep()} />
          <Button size="sm" onClick={addStep} disabled={!step.trim()}>Add</Button>
        </div>
      </Field>
      <RemindMe alarms={alarms} setAlarms={setAlarms} due={due} />
      <Field label="Notes">
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Sheet>
  );
}

/* -------------------------------- screen ------------------------------- */

function TaskRow({ task, remindAt, onOpen, onToggle }) {
  const steps = stepsOf(task);
  const tag = task.tags?.[0];
  const p = priorityOf(task);
  return (
    <Row
      accent="var(--accent-tasks)"
      onClick={onOpen}
      dim={!!task.doneAt}
      title={
        <span className="tk-title">
          {p === 'high' && !task.doneAt && <Flag size={13} className="tk-flag" aria-label="High priority" />}
          {task.title}
        </span>
      }
      meta={(task.dueAt || tag || steps.length > 0 || remindAt) && (
        <span className="tk-meta">
          {task.dueAt && <span className={`mono ${isLate(task) ? 'due-over' : ''}`}>{dueLabel(task.dueAt)}</span>}
          {remindAt && !task.doneAt && <span className="mono tk-remind"><BellRing size={11} /> {dueLabel(remindAt)}</span>}
          {steps.length > 0 && <span className="mono">{steps.filter((s) => s.done).length}/{steps.length}</span>}
          {tag && <span className="tk-tag">#{tag}</span>}
          {p === 'low' && <span className="tk-low">low</span>}
        </span>
      )}
      right={<CompleteButton completed={!!task.doneAt} onToggle={onToggle} label="Done" />}
    />
  );
}

export function TasksScreen() {
  const repo = useRepo();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined closed, null new, record
  const [tag, setTag] = useState('');
  const [showDone, setShowDone] = useState(false);

  const all = repo.query({ type: TYPE });
  const remindAt = nextReminders(repo.query({ type: REMINDER_TYPE }));
  const tags = tagsOf(all);

  // /tasks?task=<id> opens that task — Reminders and the brief link here.
  const [params, setParams] = useSearchParams();
  const wanted = params.get('task');
  useEffect(() => {
    if (!wanted) return;
    const t = repo.get(wanted);
    if (t && !t.deletedAt) setEditing(t);
    setParams({}, { replace: true });
  }, [wanted, repo, setParams]);
  const shown = tag ? all.filter((t) => (t.tags || []).includes(tag)) : all;
  const g = groupTasks(shown);
  const openCount = shown.length - g.done.length;

  const quickAdd = () => {
    const q = parseQuick(text);
    if (!q.title) return;
    repo.create(TYPE, {
      title: q.title, dueAt: dayIso(q.due), tags: q.tag ? [q.tag] : tag ? [tag] : [], data: { priority: q.priority, steps: [] },
    });
    setText('');
  };

  const clearDone = () => g.done.forEach((t) => deleteTask(repo, t));

  const group = (label, list, right) => list.length > 0 && (
    <>
      <SectionLabel right={right || <span className="mono count">{list.length}</span>}>{label}</SectionLabel>
      <Card>
        <div className="ruled">
          {list.map((t) => (
            <TaskRow key={t.id} task={t} remindAt={remindAt.get(t.id)} onOpen={() => setEditing(t)} onToggle={() => toggleDone(repo, t)} />
          ))}
        </div>
      </Card>
    </>
  );

  return (
    <div className="page has-fab">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Tasks</h1>
          <p className="page-sub">{openCount === 0 ? 'All clear.' : `${openCount} to do${g.late.length ? `, ${g.late.length} late` : ''}`}</p>
        </div>
      </div>

      <Card className="capture-card">
        <div className="capture">
          <input
            className="capture-input" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            placeholder="Add a task — #tag  !  tomorrow" aria-label="Add a task"
          />
          <Button variant="primary" size="sm" onClick={quickAdd} disabled={!parseQuick(text).title}>Add</Button>
        </div>
      </Card>

      {tags.length > 0 && (
        <div className="cat-filter-bar">
          <Chip tone={!tag ? 'accent' : 'neutral'} onClick={() => setTag('')}>All</Chip>
          {tags.map((t) => (
            <Chip key={t} tone={tag === t ? 'accent' : 'neutral'} onClick={() => setTag(tag === t ? '' : t)}>#{t}</Chip>
          ))}
        </div>
      )}

      {openCount === 0 && (
        <Card>
          <EmptyState icon={ListTodo} title={all.length ? 'Nothing to do' : 'No tasks yet'}
            body="Type one above and press Enter. Add #tag, ! for high priority, or end with today / tomorrow." />
        </Card>
      )}

      {group('Late', g.late)}
      {group('Today', g.today)}
      {group('Coming up', g.soon)}
      {group('No date', g.someday)}

      {g.done.length > 0 && (
        <>
          <SectionLabel right={
            <span className="tk-done-tools">
              {showDone && <Button size="sm" variant="quiet" onClick={clearDone}>Clear</Button>}
              <Button size="sm" variant="quiet" onClick={() => setShowDone(!showDone)}>
                {showDone ? 'Hide' : `Show ${g.done.length}`}
              </Button>
            </span>
          }>Done</SectionLabel>
          {showDone && (
            <Card>
              <div className="ruled">
                {g.done.slice(0, 50).map((t) => (
                  <TaskRow key={t.id} task={t} remindAt={remindAt.get(t.id)} onOpen={() => setEditing(t)} onToggle={() => toggleDone(repo, t)} />
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {editing !== undefined && <TaskSheet existing={editing || undefined} tags={tags} onClose={() => setEditing(undefined)} />}

      <Fab label="New task" onClick={() => setEditing(null)} />
    </div>
  );
}

/* ------------------------------ dashboard ------------------------------- */

const toDashboardItem = (t) => ({
  id: t.id, title: t.title, type: 'tasks',
  dueDate: t.dueAt, pinned: t.home === 'pinned',
  completed: !!t.doneAt, completedAt: t.doneAt,
  record: t,
});

registerProvider({
  id: 'tasks',
  getItemsForDate: (date, repo) => repo.query({ type: TYPE })
    .filter((t) => isOnAgendaDay(t.dueAt, !!t.doneAt, date))
    .map(toDashboardItem),
  getPinnedItems: (repo) => repo.query({ type: TYPE }).filter((t) => t.home === 'pinned').map(toDashboardItem),
  togglePin: (repo, item) => repo.update(item.id, { home: item.pinned ? 'auto' : 'pinned' }),
  toggleComplete: (repo, item) => toggleDone(repo, item.record),
});

/* ------------------------------- manifest ------------------------------ */

function TaskEditor({ record, close }) {
  const repo = useRepo();
  return <TaskSheet existing={record || undefined} tags={tagsOf(repo.query({ type: TYPE }))} onClose={close} />;
}

export const renderEditor = (record, close) => <TaskEditor record={record} close={close} />;

export default {
  id: 'tasks',
  title: 'Tasks',
  icon: CheckSquare,
  accent: 'var(--accent-tasks)',
  tier: 'integrated',
  routes: [{ path: '/tasks', element: <TasksScreen /> }],

  renderRef: (record) => <span className="ref-chip">{record.title}</span>,

  search: ({ repo }, q) => repo.query({ type: TYPE })
    .filter((t) => t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q)
      || (t.tags || []).some((x) => x.toLowerCase().includes(q)))
    .map((t) => ({ id: t.id, title: t.title, sub: t.doneAt ? 'Task · done' : 'Task', to: '/tasks' })),

  quickActions: [{ id: 'new-task', label: 'New task', icon: CheckSquare, to: '/tasks' }],

  raiseEvents: ({ repo }) => repo.query({ type: TYPE, done: false })
    .filter((t) => t.dueAt && isLate(t))
    .map((t) => ({
      title: 'Task overdue',
      body: t.title,
      url: '/tasks',
      kind: 'task-late',
      dedupeKey: `task-late:${t.id}:${t.dueAt}`,
    })),

  notifications: [
    { id: 'tasks.late', label: 'Overdue tasks', hint: 'When a task passes its due day undone.', default: true },
  ],
};
