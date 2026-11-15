import { useNavigate } from 'react-router-dom';
import { Sun, Bell } from 'lucide-react';
import { useRepo } from '../db/repo';
import { Sheet, Button, SectionLabel, CompleteButton, EmptyState } from '../ui/components';
import { useEditors } from '../ui/editors';
import { dueLabel } from '../dates';
import { getAllItemsForDate, providerFor } from '../dashboardRegistry';
import { unreadEvents, markRead, markAllRead } from '../notify/notify';
import { buildBrief, greeting } from './brief';
import './brief.css';

/** The daily summary sheet. `modules` comes from the shell, for icons and names. */
export default function MorningBrief({ open, onClose, modules }) {
  const repo = useRepo();
  const nav = useNavigate();
  const { openForRecord } = useEditors();
  if (!open) return null;

  const now = new Date();
  const b = buildBrief({ itemsFor: (d) => getAllItemsForDate(d, repo), events: unreadEvents(repo) }, now);
  const meta = (type) => modules.find((m) => m.id === type);

  const openItem = (item) => {
    onClose();
    if (item.to) nav(item.to);
    else if (item.record) openForRecord(item.record);
  };
  const openNotice = (e) => {
    markRead(repo, e.id);
    onClose();
    if (e.data.url) nav(e.data.url);
  };

  const item = (i, late) => {
    const m = meta(i.type);
    const p = providerFor(i.type);
    return (
      <div key={`${i.type}:${i.id}`} className="brief-row">
        {m && <m.icon size={15} strokeWidth={1.8} className="brief-icon" style={{ color: m.accent }} />}
        <button type="button" className="brief-main" onClick={() => openItem(i)}>
          <span className="brief-title">{i.title}</span>
          <span className="brief-meta">
            {m?.title}
            {i.dueDate && <> · <span className={late ? 'due-over' : ''}>{dueLabel(i.dueDate)}</span></>}
          </span>
        </button>
        {p?.toggleComplete && (
          <CompleteButton completed={false} onToggle={() => p.toggleComplete(repo, i)} label="Done" />
        )}
      </div>
    );
  };

  const section = (label, list, late = false) => list.length > 0 && (
    <>
      <SectionLabel right={<span className="mono count">{list.length}</span>}>{label}</SectionLabel>
      <div className="ruled brief-list">{list.map((i) => item(i, late))}</div>
    </>
  );

  return (
    <Sheet
      open onClose={onClose} title={greeting(now)}
      footer={
        <>
          {b.notices.length > 0 && <Button onClick={() => markAllRead(repo)}>Mark notifications read</Button>}
          <Button variant="primary" onClick={onClose}>Got it</Button>
        </>
      }
    >
      <p className="brief-date">
        {now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
        {' · '}
        {b.count === 0 ? 'nothing needs you today' : `${b.count} thing${b.count === 1 ? '' : 's'} to attend to`}
      </p>

      {b.count === 0 && b.soon.length === 0 && (
        <EmptyState icon={Sun} title="All clear" body="Nothing due, nothing late, no unread notifications." />
      )}

      {section('Late', b.late, true)}
      {section('Today', b.today)}
      {b.notices.length > 0 && (
        <>
          <SectionLabel right={<span className="mono count">{b.notices.length}</span>}>Notifications</SectionLabel>
          <div className="ruled brief-list">
            {b.notices.map((e) => (
              <div key={e.id} className="brief-row">
                <Bell size={15} strokeWidth={1.8} className="brief-icon" />
                <button type="button" className="brief-main" onClick={() => openNotice(e)}>
                  <span className="brief-title">{e.title}</span>
                  {e.data.body && <span className="brief-meta">{e.data.body}</span>}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {section('Next two days', b.soon)}
    </Sheet>
  );
}
