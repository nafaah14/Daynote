import { useState, useMemo } from 'react';
import { Card, SectionLabel, EmptyState } from '../../../core/ui/components';
import { Users } from 'lucide-react';
import { hm, money } from '../lib/overtimeEngine';

const COLS = [
  { key: 'name', label: 'Staff' },
  { key: 'genOT', label: 'General' },
  { key: 'pubOT', label: 'Holiday' },
  { key: 'pct', label: '% now' },
  { key: 'projPct', label: '% proj.' },
  { key: 'amount', label: 'Amount' },
];

/** Read-only staff table for the current period — one row per employee,
 *  current and projected overtime side by side. Clicking a row opens
 *  PersonView. */
export function StaffTable({ rows, cfg, onSelect }) {
  const [sortKey, setSortKey] = useState('projPct');
  const [sortDir, setSortDir] = useState('desc');

  const sorted = useMemo(() => {
    const val = (r) => {
      switch (sortKey) {
        case 'name': return r.e.name;
        case 'genOT': return r.all.genOT;
        case 'pubOT': return r.all.pubOT;
        case 'pct': return r.all.pct;
        case 'projPct': return r.fc.projected.pct;
        case 'amount': return r.fc.projected.amount;
        default: return 0;
      }
    };
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const setSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };

  return (
    <>
      <SectionLabel right={<span className="mono count">{rows.length}</span>}>Staff</SectionLabel>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No staff yet" body="Import an attendance report to bring staff into Overtime." />
        ) : (
          <div className="ot-table">
            <div className="ot-head" role="row">
              {COLS.map((c) => (
                <button
                  key={c.key} type="button"
                  className={`eyebrow ${c.key !== 'name' ? 'ot-cell' : ''}`}
                  style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, textAlign: c.key === 'name' ? 'left' : 'right' }}
                  onClick={() => setSort(c.key)}
                >
                  {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>
            {sorted.map((r) => (
              <div key={r.e.no} role="row" className="ot-row" onClick={() => onSelect(r.e)}>
                <div className="ot-name-cell">
                  <span className="ot-name">{r.e.name}</span>
                  <span className="ot-sub">{r.e.sid} · {r.e.desig || '—'}{!r.e.hasRosterLink && ' · no Roster salary'}</span>
                </div>
                <span className="ot-cell mono">{hm(r.all.genOT)}</span>
                <span className="ot-cell mono">{hm(r.all.pubOT)}</span>
                <span className="ot-cell mono">{r.all.pct.toFixed(1)}%</span>
                <span className={`ot-cell mono ${r.fc.projected.pct >= (cfg.alertPct || 50) ? 'ot-pct-bad' : ''}`}>
                  {r.fc.projected.pct.toFixed(1)}%
                </span>
                <span className="ot-cell mono">{cfg.currency} {money(r.fc.projected.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
