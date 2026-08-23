import { Check, Trash2 } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import { useEditors } from '../../core/ui/editors';
import { dueLabel } from '../../core/dates';
import { providerFor } from '../../core/dashboardRegistry';
import { MODULE_META } from './moduleMeta';
import { useSwipeToComplete } from './useSwipeToComplete';

/**
 * One day-agenda row. Swipe-to-complete only renders for items whose
 * provider registered a `toggleComplete` (Reminders today — Payments has
 * no flag to flip, "paid" is a computed ledger balance). Completed items
 * stay inline, greyed + struck through, at their original sort position;
 * a small trash button next to them hard-deletes from history via the
 * already-generic repo.softDelete (same path the Trash module reads from).
 */
export function AgendaRow({ item }) {
  const repo = useRepo();
  const { openForRecord } = useEditors();
  const provider = providerFor(item.type);
  const meta = MODULE_META[item.type];
  const canComplete = !!provider?.toggleComplete;

  const { dragX, dragging, revealed, wasSwipe, handlers } = useSwipeToComplete(() => {
    provider.toggleComplete(repo, item);
  });

  const open = () => { if (!wasSwipe()) openForRecord(item.record); };

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
