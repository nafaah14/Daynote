import { useState, useMemo } from 'react';
import { Card, SectionLabel, EmptyState } from '../../../core/ui/components';
import { Users } from 'lucide-react';
import { hm, money, dparse } from '../lib/overtimeEngine';

const fmt = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const COLS = [
  { key: 'worked', label: 'Worked', group: 'ot', val: (r) => r.fc.actual.worked, show: (v) => hm(v) },
  { key: 'holiday', label: 'Holiday', group: 'ot', val: (r) => r.fc.actual.pubOT, show: (v) => hm(v) },
  { key: 'general', label: 'General', group: 'ot', val: (r) => r.fc.actual.genOT, show: (v) => hm(v) },
  { key: 'otHours', label: 'OT hours', group: 'ot', val: (r) => r.fc.actual.otMin, show: (v) => hm(v), strong: true },
  { key: 'pct', label: '% of basic', group: 'wait', val: (r) => r.fc.actual.pct, show: (v) => `${v.toFixed(1)}%` },
  {
    key: 'pending', label: 'Pending', group: 'wait',
    val: (r) => r.fc.actual.pending, show: (v, r) => (v > 0 ? `${r.fc.actual.pendingRecs} · ${hm(v)}` : '—'),
  },
  { key: 'approved', label: 'Approved', group: 'wait', val: (r) => r.approved.genOT + r.approved.pubOT, show: (v) => hm(v) },
  { key: 'projHours', label: 'OT hours', group: 'proj', val: (r) => r.fc.projected.genOT + r.fc.projected.pubOT, show: (v) => hm(v), strong: true },
  {
    key: 'projPct', label: '% of basic', group: 'proj',
    val: (r) => r.fc.projected.pct, show: (v) => `${v.toFixed(1)}%`, bad: (v, cfg) => v >= (cfg.alertPct || 50),
  },
  { key: 'amount', label: 'Amount', group: 'proj', val: (r) => r.fc.projected.amount, show: (v, _r, cfg) => `${cfg.currency} ${money(v)}` },
];

/**
 * Read-only staff table — one row per employee, worked/pending/approved for
 * the range so far next to the projected full-period figures. Wider than
 * the viewport by design (11 columns), so it scrolls horizontally inside
 * its own card rather than wrapping or truncating — a plain HTML table so
 * header and data columns can never drift out of alignment with each other.
 */
export function StaffTable({ rows, cfg, asOf, periodTo, onSelect }) {
  const [sortKey, setSortKey] = useState('projHours');
  const [sortDir, setSortDir] = useState('desc');

  const sorted = useMemo(() => {
    const col = COLS.find((c) => c.key === sortKey);
    const val = (r) => (sortKey === 'name' ? r.e.name : col?.val(r) ?? 0);
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

  const arrow = (key) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  return (
    <>
      <SectionLabel right={<span className="mono count">{rows.length}</span>}>Staff</SectionLabel>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No staff yet" body="Import an attendance report to bring staff into Overtime." />
        ) : (
          <div className="ot-table-scroll">
            <table className="ot-staff-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="ot-th-name" onClick={() => setSort('name')}>Staff{arrow('name')}</th>
                  <th colSpan={4} className="ot-th-group">Overtime to {fmt(asOf)}</th>
                  <th colSpan={3} className="ot-th-group">Awaiting decision</th>
                  <th colSpan={3} className="ot-th-group">Projected to {fmt(periodTo)}</th>
                </tr>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} onClick={() => setSort(c.key)}>{c.label}{arrow(c.key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.e.no} onClick={() => onSelect(r.e)}>
                    <td className="ot-th-name">
                      <div className="ot-name-cell">
                        <span className="ot-name">{r.e.name}</span>
                        <span className="ot-sub">{r.e.sid} · {r.e.desig || '—'}{!r.e.hasRosterLink && ' · no Roster salary'}</span>
                      </div>
                    </td>
                    {COLS.map((c) => {
                      const v = c.val(r);
                      const bad = c.bad?.(v, cfg);
                      return (
                        <td key={c.key} className={`mono ${c.strong ? 'ot-strong' : ''} ${bad ? 'ot-pct-bad' : ''}`}>
                          {c.show(v, r, cfg)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
