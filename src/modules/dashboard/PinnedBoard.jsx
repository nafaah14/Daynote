import { X } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import { useEditors } from '../../core/ui/editors';
import { getPinnedItems, providerFor } from '../../core/dashboardRegistry';
import { MODULE_META } from './moduleMeta';

/**
 * Fixed top strip, always visible, independent of the selected day —
 * everything home==='pinned' across every registered module. The one place
 * Dashboard puts a control directly on an item (unpin, via each module's
 * registered togglePin): a pinned strip with no way to remove something
 * without leaving the screen would be bad UX. Day-agenda rows stay clean
 * of controls otherwise, same reasoning already applied on Today.
 */
export function PinnedBoard() {
  const repo = useRepo();
  const { openForRecord } = useEditors();
  const items = getPinnedItems(repo);

  if (!items.length) return null;

  return (
    <div className="dash-pinned">
      {items.map((item) => {
        const meta = MODULE_META[item.type];
        return (
          <div className="dash-pinned-chip" key={item.id}>
            <button type="button" className="dash-pinned-main" onClick={() => openForRecord(item.record)}>
              {meta && <meta.icon size={13} strokeWidth={1.8} style={{ color: meta.accent }} />}
              <span className="dash-pinned-title">{item.title}</span>
            </button>
            <button
              type="button" className="dash-pinned-unpin" aria-label={`Unpin ${item.title}`}
              onClick={() => providerFor(item.type).togglePin(repo, item)}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
