import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { providerFor } from '../../core/dashboardRegistry';

/**
 * A date-assigned list's day-agenda entry. Denser than a plain AgendaRow —
 * a list is a small collection, not a single yes/no action — so it gets its
 * own card: a collapsed header (icon identifies it as a list, title, open
 * count) that expands in place on tap, no chevron needed since the header
 * itself is the toggle. Expanded content comes from the lists module's own
 * `renderInline` (registered in modules/lists/index.jsx) so this file never
 * imports the lists module directly.
 */
export function ListAgendaCard({ item }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const provider = providerFor(item.type);

  return (
    <div className={`dash-list-card ${item.completed ? 'is-completed' : ''}`}>
      <button
        type="button"
        className={`dash-list-head ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
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
