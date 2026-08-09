import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, AlertTriangle, Info, Sparkles, History, Check } from 'lucide-react';
import { useRepo } from '../db/repo';
import { Sheet, EmptyState, Button } from '../ui/components';
import { allEvents, unreadEvents, markRead, markAllRead } from './notify';
import { dueLabel } from '../dates';

const ICONS = {
  reminder: BellRing,
  alert: AlertTriangle,
  system: Sparkles,
  info: Info,
};

const TONES = {
  reminder: 'var(--accent-reminders)',
  alert: 'var(--out)',
  system: 'var(--accent-inbox)',
  info: 'var(--muted)',
};

export function NotifyBell({ onClick }) {
  const repo = useRepo();
  const count = unreadEvents(repo).length;
  return (
    <button className="icon-btn bell" onClick={onClick} aria-label={`Notifications${count ? `, ${count} unread` : ''}`}>
      <Bell size={18} />
      {count > 0 && <span className="bell-dot">{count > 9 ? '9+' : count}</span>}
    </button>
  );
}

export function NotifyPanel({ open, onClose }) {
  const repo = useRepo();
  const nav = useNavigate();
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => { if (!open) setShowHistory(false); }, [open]);

  const unread = unreadEvents(repo);
  const everything = allEvents(repo);
  const list = showHistory ? everything : unread;

  const open_ = (e) => {
    markRead(repo, e.id);
    if (e.data.url) { onClose(); nav(e.data.url); }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={showHistory ? 'All notifications' : 'Notifications'}
      footer={
        <>
          <Button size="sm" onClick={() => setShowHistory((v) => !v)}>
            <History size={14} /> {showHistory ? 'Unread only' : `History (${everything.length})`}
          </Button>
          {unread.length > 0 && (
            <Button size="sm" variant="primary" onClick={() => markAllRead(repo)}>
              <Check size={14} /> Mark all read
            </Button>
          )}
        </>
      }
    >
      {list.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={showHistory ? 'Nothing here yet' : 'All caught up'}
          body={showHistory
            ? 'Notifications will collect here as things happen.'
            : 'Anything new turns up here, whether or not a push made it to your phone.'}
        />
      ) : (
        <div className="notify-list ruled">
          {list.map((e) => {
            const Icon = ICONS[e.data.kind] || Info;
            const tone = TONES[e.data.kind] || 'var(--muted)';
            const isRead = !!e.data.readAt;
            return (
              <button
                key={e.id}
                className={`notify-item ${isRead ? 'is-read' : ''}`}
                onClick={() => open_(e)}
              >
                <span className="notify-icon" style={{ color: tone }}><Icon size={16} /></span>
                <span className="notify-body">
                  <span className="notify-title">{e.title}</span>
                  {e.data.body && <span className="notify-text">{e.data.body}</span>}
                  <span className="notify-time mono">{dueLabel(e.createdAt)}</span>
                </span>
                {!isRead && <span className="notify-unread" aria-label="Unread" />}
              </button>
            );
          })}
        </div>
      )}

      {showHistory && everything.length > 0 && (
        <p className="settings-note">
          History keeps the last 200. Read items don't count towards the badge.
        </p>
      )}
    </Sheet>
  );
}
