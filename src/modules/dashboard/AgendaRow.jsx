import { Check, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRepo } from '../../core/db/repo';
import { useEditors } from '../../core/ui/editors';
import { CompleteButton } from '../../core/ui/components';
import { dueLabel } from '../../core/dates';
import { providerFor } from '../../core/dashboardRegistry';
import { MODULE_META } from './moduleMeta';
import { useSwipeToComplete } from './useSwipeToComplete';

/**
 * One day-agenda row. The explicit CompleteButton on the right is the
 * primary, discoverable way to complete something — swipe-left is a bonus
 * gesture layered on top, not a replacement for it. Only renders for items
 * whose provider registered a `toggleComplete` (Reminders today — Payments
 * has no flag to flip, "paid" is a computed ledger balance). Completed
 * items stay inline, at their original sort position, just greyed — no
 * strikethrough, so text stays left-aligned and every control lives on
 * the right — with a small trash button that hard-deletes from history
 * via the already-generic repo.softDelete (same path the Trash module
 * reads from).
 */
export function AgendaRow({ item }) {
  const repo = useRepo();
  const nav = useNavigate();
  const { openForRecord } = useEditors();
  const provider = providerFor(item.type);
  const meta = MODULE_META[item.type];
  const canComplete = !!provider?.toggleComplete;

  const toggle = () => provider.toggleComplete(repo, item);
  const { dragX, dragging, revealed, wasSwipe, handlers } = useSwipeToComplete(toggle);

  const open = () => {
    if (wasSwipe()) return;
    if (item.to) nav(item.to);
    else openForRecord(item.record);
  };

  return (
    <div className={`dash-row-wrap ${item.completed ? 'is-completed' : ''}`}>
      {canComplete && (
        <div className="dash-row-complete-bg" style={{ opacity: revealed }}>
          <Check size={16} /> Complete
        </div>
      )}
      <div
        className="dash-row"
        style={{ transform: `translateX(${dragX}px)`, transition: dragging ? 'none' : undefined }}
        onClick={open}
        {...(canComplete ? handlers : {})}
      >
        {meta && <meta.icon size={15} strokeWidth={1.8} className="dash-row-icon" style={{ color: meta.accent }} />}
        <span className="dash-row-title">{item.title}</span>
        {item.dueDate && <span className="dash-row-time mono">{dueLabel(item.dueDate)}</span>}
        {canComplete && <CompleteButton completed={item.completed} onToggle={toggle} />}
        {item.completed && (
          <button
            type="button" className="dash-row-delete" aria-label={`Delete ${item.title} from history`}
            onClick={(e) => { e.stopPropagation(); repo.softDelete(item.id); }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
