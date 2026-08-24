import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { providerFor } from '../../core/dashboardRegistry';

// Same localStorage-backed pattern as the Lists module's own expand memory
// (modules/lists/index.jsx's EXPAND_KEY), kept as a separate key since this
// is a different screen — expanding a list here shouldn't silently expand
// it on the Lists overview too, or vice versa.
const EXPAND_KEY = 'daybook.dashboard.expandedLists';
function loadExpanded() {
  try { return new Set(JSON.parse(localStorage.getItem(EXPAND_KEY) || '[]')); }
  catch { return new Set(); }
}
function persistExpanded(id, on) {
  const set = loadExpanded();
  if (on) set.add(id); else set.delete(id);
  try { localStorage.setItem(EXPAND_KEY, JSON.stringify([...set])); } catch { /* quota */ }
}

/**
 * A date-assigned list's day-agenda entry. Denser than a plain AgendaRow —
 * a list is a small collection, not a single yes/no action — so it gets its
 * own card: a collapsed header (icon identifies it as a list, title, open
 * count) that expands in place on tap, no chevron needed since the header
 * itself is the toggle. Expanded content comes from the lists module's own
 * `renderInline` (registered in modules/lists/index.jsx) so this file never
 * imports the lists module directly.
 *
 * Open/closed state persists per list id (not just per-mount local state) —
 * otherwise navigating away from Dashboard and back, or switching days and
 * back to one showing the same list, silently re-collapsed it every time.
 */
export function ListAgendaCard({ item }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(() => loadExpanded().has(item.id));
  const provider = providerFor(item.type);

  const toggle = () => setOpen((o) => { const next = !o; persistExpanded(item.id, next); return next; });

  return (
    <div className={`dash-list-card ${item.completed ? 'is-completed' : ''}`}>
      <button
        type="button"
        className={`dash-list-head ${open ? 'is-open' : ''}`}
        onClick={toggle}
        aria-expanded={open}
      >
        <ListChecks size={15} strokeWidth={1.8} className="dash-row-icon" style={{ color: 'var(--accent-lists)' }} />
        <span className="dash-row-title">{item.title}</span>
        <span className="dash-list-count">{item.openCount > 0 ? `${item.openCount} left` : 'All done'}</span>
      </button>
      {open && (
        <div className="dash-list-body">
          {provider?.renderInline?.(item.record)}
          {item.to && (
            <button type="button" className="dash-list-open-link" onClick={() => nav(item.to)}>
              Open list
            </button>
          )}
        </div>
      )}
    </div>
  );
}
