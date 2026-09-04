import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Lightbulb, ArrowLeft, Trash2 } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import {
  Card, Row, SectionLabel, EmptyState, Button, Sheet, Field, Input, Select, Textarea, Chip, CompleteButton,
} from '../../core/ui/components';
import { Fab } from '../../core/ui/extras';
import './ideas.css';

export const IDEA_TYPE = 'ideas.idea';
export const ACTION_TYPE = 'ideas.action';

export const STATUSES = [
  { value: 'active', label: 'Active', hint: "Something you're actually working on or plan to." },
  { value: 'someday', label: 'Someday', hint: 'A good idea — just not right now.' },
  { value: 'done', label: 'Done', hint: 'Completed, kept for reference.' },
  { value: 'archived', label: 'Archived', hint: "Decided against — out of the way, not deleted." },
];

// Past this many quiet days, an active idea gets a soft note on its own
// screen/row; past the longer threshold, it also earns a notification-
// centre nudge (see raiseEvents below) — two thresholds because seeing it
// yourself while browsing should happen well before the app interrupts you.
export const STALE_WARN_DAYS = 14;
export const STALE_NOTIFY_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** null when there's nothing to measure yet — zero actions isn't "0% done", it's "not started measuring". */
export function progressOf(actions) {
  if (!actions.length) return null;
  const done = actions.filter((a) => !!a.doneAt).length;
  return { done, total: actions.length, pct: Math.round((done / actions.length) * 100) };
}

/** The idea counts as "touched" whenever any of its actions were too — adding
 *  or checking off a step is real progress, even if nobody edited the idea's
 *  own title/detail/status that day. Avoids a second write to the idea
 *  record just to bump its own updatedAt whenever an action changes. */
export function lastTouched(idea, actions) {
  const times = [idea.updatedAt, ...actions.map((a) => a.updatedAt)]
    .filter(Boolean).map((t) => new Date(t).getTime());
  return times.length ? Math.max(...times) : new Date(idea.updatedAt).getTime();
}

const daysSince = (ts) => Math.floor((Date.now() - ts) / DAY_MS);

/* ------------------------------ idea editor ----------------------------- */

function IdeaSheet({ open, onClose, existing }) {
  const repo = useRepo();
  const nav = useNavigate();
  const [title, setTitle] = useState(existing?.title || '');
  const [status, setStatus] = useState(existing?.data?.status || 'active');
  const [detail, setDetail] = useState(existing?.notes || '');

  const save = () => {
    if (!title.trim()) return;
    if (existing) {
      repo.update(existing.id, { title: title.trim(), notes: detail, data: { ...existing.data, status } });
    } else {
      const rec = repo.create(IDEA_TYPE, { title: title.trim(), notes: detail, data: { status, progressNote: '' } });
      nav(`/ideas/${rec.id}`);
    }
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    if (!window.confirm(`Delete "${existing.title}" and its actions?`)) return;
    repo.query({ type: ACTION_TYPE })
      .filter((a) => a.data?.ideaId === existing.id)
      .forEach((a) => repo.softDelete(a.id));
    repo.softDelete(existing.id);
    onClose();
    nav('/ideas');
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit idea' : 'New idea'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>
            {existing ? 'Save changes' : 'Create idea'}
          </Button>
        </>
      }
    >
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Open a coffee shop downtown" autoFocus />
      </Field>
      <Field label="Status" hint={STATUSES.find((s) => s.value === status)?.hint}>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </Field>
      <Field label="Details" hint="Whatever you want to remember about it — the plan, the reasoning, anything.">
        <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={5} placeholder="What's the idea?" />
      </Field>
      {existing && (
        <Button variant="danger" size="sm" onClick={remove}>Delete idea</Button>
      )}
    </Sheet>
  );
}

export const renderEditor = (record, close) => (
  <IdeaSheet open onClose={close} existing={record || undefined} />
);

/* -------------------------------- one idea ------------------------------- */

function ActionRow({ action, onToggle, onDelete }) {
  return (
    <Row
      accent="var(--accent-ideas)"
      title={action.title}
      dim={!!action.doneAt}
      right={
        <span className="list-item-actions">
          <CompleteButton completed={!!action.doneAt} onToggle={onToggle} label="Done" />
          <button className="icon-btn" title="Delete action" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 size={13} />
          </button>
        </span>
      }
    />
  );
}

export function IdeaScreen() {
  const { ideaId } = useParams();
  const nav = useNavigate();
  const repo = useRepo();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const idea = repo.get(ideaId);
  if (!idea || idea.deletedAt) {
    return (
      <div className="page">
        <Card>
          <EmptyState icon={Lightbulb} title="Idea not found" body="It may have been deleted."
            action={<Button variant="outline" size="sm" onClick={() => nav('/ideas')}>Back to ideas</Button>} />
        </Card>
      </div>
    );
  }

  const status = idea.data?.status || 'active';
  const actions = repo.query({ type: ACTION_TYPE }).filter((a) => a.data?.ideaId === ideaId);
  const openActions = actions.filter((a) => !a.doneAt);
  const doneActions = actions.filter((a) => a.doneAt);
  const progress = progressOf(actions);
  const idleDays = daysSince(lastTouched(idea, actions));
  const progressNote = idea.data?.progressNote || '';

  const addAction = () => {
    const t = text.trim();
    if (!t) return;
    repo.create(ACTION_TYPE, { title: t, data: { ideaId } });
    setText('');
  };

  const setStatus = (value) => repo.update(idea.id, { data: { ...idea.data, status: value } });
  const commitProgressNote = (value) => {
    if (value !== progressNote) repo.update(idea.id, { data: { ...idea.data, progressNote: value } });
  };

  const remove = () => {
    if (!window.confirm(`Delete "${idea.title}" and its actions?`)) return;
    actions.forEach((a) => repo.softDelete(a.id));
    repo.softDelete(idea.id);
    nav('/ideas');
  };

  const renderAction = (a) => (
    <ActionRow
      key={a.id}
      action={a}
      onToggle={() => repo.update(a.id, { doneAt: a.doneAt ? null : new Date().toISOString() })}
      onDelete={() => repo.softDelete(a.id)}
    />
  );

  return (
    <div className="page">
      <button className="back" onClick={() => nav('/ideas')}><ArrowLeft size={15} /> Ideas</button>
      <div className="page-head">
        <div>
          <h1 className="page-title serif">{idea.title}</h1>
          <p className="page-sub">
            {status === 'active' && idleDays >= STALE_WARN_DAYS
              ? <span className="idea-stale">Quiet for {idleDays} days</span>
              : `Last touched ${idleDays === 0 ? 'today' : `${idleDays}d ago`}`}
          </p>
        </div>
        <div className="head-actions">
          <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>
          <button className="icon-btn danger" aria-label="Delete idea" title="Delete idea" onClick={remove}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="cat-filter-bar">
        {STATUSES.map((s) => (
          <Chip key={s.value} tone={status === s.value ? 'accent' : 'neutral'} onClick={() => setStatus(s.value)}>
            {s.label}
          </Chip>
        ))}
      </div>

      <Card>
        <div className="idea-detail">
          {idea.notes
            ? idea.notes.split('\n').map((line, i) => <p key={i}>{line || ' '}</p>)
            : <span className="ot-sub">No details yet — add them from Edit.</span>}
        </div>
      </Card>

      {progress && (
        <>
          <SectionLabel right={<span className="mono count">{progress.done}/{progress.total}</span>}>Progress</SectionLabel>
          <Card>
            <div className="idea-progress-bar"><span style={{ width: `${progress.pct}%` }} /></div>
          </Card>
        </>
      )}

      <Field label="Status note" hint="Optional context a percentage can't carry — e.g. &quot;waiting on funding&quot;.">
        <Input
          defaultValue={progressNote}
          onBlur={(e) => commitProgressNote(e.target.value)}
          placeholder="What's the holdup, or what's next"
        />
      </Field>

      <Card className="capture-card">
        <div className="capture">
          <input
            className="capture-input" placeholder="Add an action" value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addAction()}
            aria-label="Add an action"
          />
          <Button variant="primary" size="sm" onClick={addAction} disabled={!text.trim()}>Add</Button>
        </div>
      </Card>

      <SectionLabel right={<span className="mono count">{openActions.length}</span>}>To do</SectionLabel>
      <Card>
        {openActions.length === 0 ? (
          <EmptyState icon={Lightbulb} title="Nothing yet" body="Add the first step above." />
        ) : (
          <div className="ruled">{openActions.map(renderAction)}</div>
        )}
      </Card>

      {doneActions.length > 0 && (
        <>
          <SectionLabel right={<span className="mono count">{doneActions.length}</span>}>Done</SectionLabel>
          <Card><div className="ruled">{doneActions.map(renderAction)}</div></Card>
        </>
      )}

      {editing && <IdeaSheet open onClose={() => setEditing(false)} existing={idea} />}
    </div>
  );
}

/* ------------------------------- all ideas ------------------------------- */

const FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'someday', label: 'Someday' },
  { value: 'done', label: 'Done' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

function IdeaRow({ idea, actions, onOpen }) {
  const progress = progressOf(actions);
  const status = idea.data?.status || 'active';
  const idleDays = daysSince(lastTouched(idea, actions));
  const isStale = status === 'active' && idleDays >= STALE_WARN_DAYS;
  return (
    <Row
      accent="var(--accent-ideas)"
      onClick={onOpen}
      title={
        <span className="idea-title-row">
          {idea.title}
          {isStale && <span className="idea-stale-dot" title={`Quiet for ${idleDays} days`} />}
        </span>
      }
      meta={<Chip tone="neutral">{STATUSES.find((s) => s.value === status)?.label}</Chip>}
      right={<span className="mono">{progress ? `${progress.done}/${progress.total}` : '—'}</span>}
    />
  );
}

export function IdeasScreen() {
  const repo = useRepo();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('active');

  const ideas = repo.query({ type: IDEA_TYPE });
  const allActions = repo.query({ type: ACTION_TYPE });
  const actionsFor = (id) => allActions.filter((a) => a.data?.ideaId === id);

  const filtered = filter === 'all' ? ideas : ideas.filter((i) => (i.data?.status || 'active') === filter);

  // The Active tab sorts stalest-first — the one place in the UI that
  // directly fights "I forgot this existed"; every other tab is an archive
  // of sorts, so newest-first (what you'd expect from any other list) fits
  // better there.
  const sorted = useMemo(() => {
    const list = [...filtered];
    if (filter === 'active') {
      list.sort((a, b) => lastTouched(a, actionsFor(a.id)) - lastTouched(b, actionsFor(b.id)));
    } else {
      list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, filter, allActions]);

  return (
    <div className="page has-fab">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Ideas</h1>
          <p className="page-sub">Capture it before it slips away.</p>
        </div>
      </div>

      <div className="cat-filter-bar">
        {FILTERS.map((f) => (
          <Chip key={f.value} tone={filter === f.value ? 'accent' : 'neutral'} onClick={() => setFilter(f.value)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {ideas.length === 0 ? (
        <Card>
          <EmptyState
            icon={Lightbulb}
            title="No ideas yet"
            body="The next good one won't wait for a perfect moment — jot the title, fill in the rest later."
            action={<Button variant="outline" size="sm" onClick={() => setCreating(true)}>Add an idea</Button>}
          />
        </Card>
      ) : sorted.length === 0 ? (
        <Card><EmptyState icon={Lightbulb} title="Nothing here" body="No ideas with this status." /></Card>
      ) : (
        <Card>
          <div className="ruled">
            {sorted.map((idea) => (
              <IdeaRow key={idea.id} idea={idea} actions={actionsFor(idea.id)} onOpen={() => nav(`/ideas/${idea.id}`)} />
            ))}
          </div>
        </Card>
      )}

      {creating && <IdeaSheet open onClose={() => setCreating(false)} />}

      <Fab label="New idea" onClick={() => setCreating(true)} />
    </div>
  );
}

/* ------------------------------- manifest -------------------------------- */

export default {
  id: 'ideas',
  title: 'Ideas',
  icon: Lightbulb,
  accent: 'var(--accent-ideas)',
  tier: 'integrated',
  routes: [
    { path: '/ideas', element: <IdeasScreen /> },
    { path: '/ideas/:ideaId', element: <IdeaScreen /> },
  ],

  renderRef: (record) => <span className="ref-chip">{record.title}</span>,

  search: ({ repo }, q) => {
    const ideas = repo.query({ type: IDEA_TYPE });
    const nameOf = (id) => ideas.find((i) => i.id === id)?.title || 'Idea';
    return [
      ...ideas.filter((i) => i.title.toLowerCase().includes(q) || (i.notes || '').toLowerCase().includes(q))
        .map((i) => ({ id: i.id, title: i.title, sub: 'Idea', to: `/ideas/${i.id}` })),
      ...repo.query({ type: ACTION_TYPE }).filter((a) => a.title.toLowerCase().includes(q))
        .map((a) => ({ id: a.id, title: a.title, sub: nameOf(a.data?.ideaId), to: `/ideas/${a.data?.ideaId}` })),
    ];
  },

  quickActions: [{ id: 'new-idea', label: 'New idea', icon: Lightbulb, to: '/ideas' }],

  // Opt-in notification-centre feed (see reminders/index.jsx for the same
  // shape) — the "actively resurface a forgotten idea" half of the ask, since
  // passive storage alone doesn't fight the user's actual problem. dedupeKey
  // includes a week bucket so the same idea nudges again weekly rather than
  // once ever (never re-seen) or every reload (spam).
  raiseEvents: ({ repo }) => {
    const weekBucket = Math.floor(Date.now() / WEEK_MS);
    const actions = repo.query({ type: ACTION_TYPE });
    return repo.query({ type: IDEA_TYPE })
      .filter((i) => (i.data?.status || 'active') === 'active')
      .filter((i) => daysSince(lastTouched(i, actions.filter((a) => a.data?.ideaId === i.id))) >= STALE_NOTIFY_DAYS)
      .map((i) => ({
        title: 'An idea has gone quiet',
        body: i.title,
        url: `/ideas/${i.id}`,
        kind: 'idea-stale',
        dedupeKey: `idea-stale:${i.id}:${weekBucket}`,
      }));
  },

  notifications: [
    { id: 'ideas.stale', label: 'Quiet ideas', hint: "A nudge when an active idea hasn't been touched in a while.", default: true },
  ],
};
