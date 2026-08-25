import { Trash2, RotateCcw } from 'lucide-react';
import { useRepo } from '../../core/db/repo';
import { Card, Row, SectionLabel, EmptyState } from '../../core/ui/components';
import { dueLabel } from '../../core/dates';

const TRASH_DAYS = 5;

/** Group deleted records by their module type prefix (before the dot). */
function groupByModule(records) {
  const map = {};
  records.forEach((r) => {
    const mod = r.type.split('.')[0] || 'other';
    (map[mod] ||= []).push(r);
  });
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

export function TrashScreen() {
  const repo = useRepo();
  const trash = repo.queryTrash(TRASH_DAYS);
  const groups = groupByModule(trash);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Trash</h1>
          <p className="page-sub">Deleted items stay here for {TRASH_DAYS} days, then disappear for good.</p>
        </div>
      </div>

      {trash.length === 0 ? (
        <Card>
          <EmptyState icon={Trash2} title="Trash is empty" body="Items you delete will appear here for a few days before they're gone." />
        </Card>
      ) : (
        groups.map(([mod, items]) => (
          <section key={mod}>
            <SectionLabel right={<span className="mono count">{items.length}</span>}>
              {mod.charAt(0).toUpperCase() + mod.slice(1)}
            </SectionLabel>
            <Card>
              <div className="ruled">
                {items.map((r) => (
                  <Row
                    key={r.id}
                    title={r.title || '(untitled)'}
                    muted
                    meta={<span className="mono">{dueLabel(r.deletedAt)}</span>}
                    right={
                      <button
                        className="icon-btn"
                        title="Restore"
                        aria-label={`Restore ${r.title}`}
                        onClick={() => repo.restore(r.id)}
                      >
                        <RotateCcw size={16} />
                      </button>
                    }
                  />
                ))}
              </div>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}

export default {
  id: 'trash',
  title: 'Trash',
  icon: Trash2,
  accent: 'var(--muted)',
  tier: 'integrated',
  routes: [{ path: '/trash', element: <TrashScreen /> }],
  search: () => [],
};
