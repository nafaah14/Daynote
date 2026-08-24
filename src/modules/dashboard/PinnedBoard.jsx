import { useState } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  const nav = useNavigate();
  const { openForRecord } = useEditors();
  const items = getPinnedItems(repo);
  const [preview, setPreview] = useState(null); // the item currently showing a quick preview

  if (!items.length) return null;

  const goTo = (item) => {
    if (item.to) nav(item.to);
    else openForRecord(item.record);
  };

  const openItem = (item) => {
    const provider = providerFor(item.type);
    if (provider?.renderPreview) { setPreview(item); return; }
    goTo(item);
  };

  /**
   * The preview Sheet's own close (any unmount, not just its Close button)
   * schedules a deferred history.back() to pop the entry it pushed on open
   * (see useBackClose). Navigating forward in the same tick just gets
   * reverted by that back() once it fires — the destination flashes, then
   * bounces back to Dashboard. Waiting for the real popstate it produces,
   * rather than guessing at timing, sidesteps the race entirely: only once
   * the sheet's own entry is actually popped do we push the real one.
   */
  const openFromPreview = (item) => {
    setPreview(null);
    const after = () => { window.removeEventListener('popstate', after); goTo(item); };
    window.addEventListener('popstate', after);
  };

  return (
    <>
      <div className="dash-pinned">
        {items.map((item) => {
          const meta = MODULE_META[item.type];
          return (
            <div className="dash-pinned-chip" key={item.id}>
              <button type="button" className="dash-pinned-main" onClick={() => openItem(item)}>
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
      {preview && providerFor(preview.type).renderPreview(preview.record, {
        onOpen: () => openFromPreview(preview),
        onClose: () => setPreview(null),
      })}
    </>
  );
}
