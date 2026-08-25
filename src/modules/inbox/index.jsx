import { useState } from 'react';
import { Inbox as InboxIcon, ArrowRight, Trash2 } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import { Card, Row, SectionLabel, EmptyState, Button, Sheet } from '../../core/ui/components';
import { dueLabel } from '../../core/dates';

export const TYPE = 'inbox.item';

/* ------------------------------- capture ------------------------------- */

export function CaptureBar() {
  const repo = useRepo();
  const [text, setText] = useState('');

  const save = () => {
    const t = text.trim();
    if (!t) return;
    repo.create(TYPE, { title: t });
    setText('');
  };

  return (
    <div className="capture">
      <input
        className="capture-input"
        placeholder="Write it down, sort it out later"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        aria-label="Capture a thought"
      />
      <Button variant="primary" size="sm" onClick={save} disabled={!text.trim()}>Save</Button>
    </div>
  );
}

/**
 * The Inbox composer sits at the bottom, within thumb reach, and never grabs
 * focus on arrival — an unrequested keyboard covers half a phone screen and
 * makes the list you came to read unreadable.
 */
export function Composer() {
  const repo = useRepo();
  const [text, setText] = useState('');

  const save = () => {
    const t = text.trim();
    if (!t) return;
    repo.create(TYPE, { title: t });
    setText('');
  };

  return (
    <div className="composer">
      <div className="composer-inner">
        <input
          className="composer-input"
          placeholder="Write it down, sort it out later"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          aria-label="Capture a thought"
        />
        <Button variant="primary" size="sm" onClick={save} disabled={!text.trim()}>Save</Button>
      </div>
    </div>
  );
}

/* ------------------------------- triage -------------------------------- */

function TriageSheet({ item, onClose }) {
  const repo = useRepo();
  const [pickingList, setPickingList] = useState(false);
  if (!item) return null;

  // Read across modules by type string, not by importing them.
  // Modules never import each other — that rule is what keeps this removable.
  const lists = repo.query({ type: 'lists.list' });

  const convert = (type, extra = {}) => {
    repo.update(item.id, { type, ...extra });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={pickingList ? 'Which list?' : 'What is this?'}>
      <p className="triage-quote serif">{item.title}</p>

      {pickingList ? (
        <div className="triage-grid">
          {lists.length === 0 ? (
            <p className="field-hint">
              No lists yet. Create one in Lists first, then come back and sort this.
            </p>
          ) : lists.map((l) => (
            <Button key={l.id} variant="outline" onClick={() => convert('lists.item', { data: { listId: l.id } })}>
              {l.title}
              <span className="triage-hint">{l.data?.mode === 'collection' ? 'Collection' : 'Clearable'}</span>
            </Button>
          ))}
          <Button size="sm" onClick={() => setPickingList(false)}>Back</Button>
        </div>
      ) : (
        <div className="triage-grid">
          <Button variant="outline" onClick={() => convert('reminders.task')}>
            Reminder <span className="triage-hint">Comes and finds me at a time</span>
          </Button>
          <Button variant="outline" onClick={() => setPickingList(true)}>
            List item <span className="triage-hint">Waits until I'm in the right place</span>
          </Button>
          <Button variant="outline" onClick={() => convert('notes.note')}>
            Note <span className="triage-hint">Just keep it</span>
          </Button>
        </div>
      )}

      <div className="triage-foot">
        <Button variant="danger" size="sm" onClick={() => { repo.softDelete(item.id); onClose(); }}>
          <Trash2 size={14} /> Delete
        </Button>
      </div>
    </Sheet>
  );
}

/* -------------------------------- screen ------------------------------- */

export function InboxScreen() {
  const repo = useRepo();
  const [triaging, setTriaging] = useState(null);
  const items = repo.query({ type: TYPE });

  return (
    <div className="page has-composer">
      <h1 className="page-title serif">Inbox</h1>
      <p className="page-sub">
        Anything you haven't decided about yet. What piles up here tells you which module to build next.
      </p>

      <SectionLabel right={<span className="mono count">{items.length}</span>}>Waiting</SectionLabel>
      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title="Nothing waiting"
            body="Capture a thought above without deciding what it is yet."
          />
        ) : (
          <div className="ruled">
            {items.map((it) => (
              <Row
                key={it.id}
                accent="var(--accent-inbox)"
                title={it.title}
                meta={dueLabel(it.createdAt)}
                right={<ArrowRight size={15} />}
                onClick={() => setTriaging(it)}
              />
            ))}
          </div>
        )}
      </Card>

      <TriageSheet item={triaging} onClose={() => setTriaging(null)} />
      <Composer />
    </div>
  );
}

/* ------------------------------- manifest ------------------------------ */

export default {
  id: 'inbox',
  title: 'Inbox',
  icon: InboxIcon,
  accent: 'var(--accent-inbox)',
  tier: 'integrated',
  routes: [{ path: '/inbox', element: <InboxScreen /> }],

  renderRef: (record) => <span className="ref-chip">{record.title}</span>,

  search: ({ repo }, q) =>
    repo.query({ type: TYPE })
      .filter((r) => r.title.toLowerCase().includes(q))
      .map((r) => ({ id: r.id, title: r.title, sub: 'Inbox', to: '/inbox' })),

  quickActions: [],
};
