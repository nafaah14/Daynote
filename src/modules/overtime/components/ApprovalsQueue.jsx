import { useMemo, useState } from 'react';
import { Card, SectionLabel, EmptyState, Button, Checkbox } from '../../../core/ui/components';
import { CheckCheck } from 'lucide-react';
import { hm, rateOf } from '../lib/overtimeEngine';
import { HHMMField } from './HHMMField';

const TABS = [
  ['all', 'Everything'],
  ['callout', 'Call-outs only'],
  ['extension', 'Duty extensions only'],
];

/**
 * Cross-staff worklist of pending extra-time entries, grouped by date and
 * filterable to call-outs or duty extensions (surfaced separately per
 * HANDOVER.md so emergency trips-in can be decided on their own). Every
 * entry gets its own hh:mm field, editable before it's approved — bulk
 * approval uses whatever is currently in that field, not always the
 * recorded length.
 */
export function ApprovalsQueue({ rows, cfg, dayOf, patchDay, onOpenPerson }) {
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [overrides, setOverrides] = useState({}); // key -> minutes

  const pending = useMemo(() => {
    const items = [];
    rows.forEach((row) => {
      row.fc.actual.days.forEach((day) => {
        day.recs.forEach((rec) => {
          if (rec.app) return;
          if (tab !== 'all' && rec.kind !== tab) return;
          items.push({ key: `${row.e.no}|${day.d}|${rec.id}`, emp: row.e, date: day.d, day, rec });
        });
      });
    });
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [rows, tab]);

  const itemsByKey = useMemo(() => new Map(pending.map((it) => [it.key, it])), [pending]);

  const grouped = useMemo(() => {
    const byDate = new Map();
    pending.forEach((it) => { (byDate.get(it.date) || byDate.set(it.date, []).get(it.date)).push(it); });
    return [...byDate.entries()];
  }, [pending]);

  const minutesFor = (it) => (overrides[it.key] != null ? overrides[it.key] : (it.rec.appMin ?? it.rec.min));

  const totalRecorded = pending.reduce((s, it) => s + it.rec.min, 0);
  const atStake = pending.reduce((s, it) => {
    const mult = it.day.holiday ? cfg.publicMult : cfg.generalMult;
    return s + (minutesFor(it) / 60) * rateOf(it.emp, cfg) * mult;
  }, 0);

  const toggle = (key) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const selectAll = () => setSelected(new Set(pending.map((it) => it.key)));
  const clearSelection = () => setSelected(new Set());

  const writeApprovals = (items) => {
    const groups = new Map(); // "empNo|date" -> [item, ...]
    items.forEach((it) => {
      const gk = `${it.emp.no}|${it.date}`;
      (groups.get(gk) || groups.set(gk, []).get(gk)).push(it);
    });
    groups.forEach((its, gk) => {
      const [empNo, date] = gk.split('|');
      const raw = dayOf(empNo, date) || {};
      const appr = { ...(raw.appr || {}) };
      its.forEach((it) => { appr[it.rec.id] = { app: true, appMin: minutesFor(it) }; });
      patchDay(empNo, date, { appr });
    });
  };

  const approveSelected = () => {
    writeApprovals([...selected].map((k) => itemsByKey.get(k)).filter(Boolean));
    setSelected(new Set());
  };

  return (
    <>
      {pending.length > 0 && (
        <p className="ot-sub" style={{ marginBottom: 12 }}>
          {hm(totalRecorded)} recorded · {cfg.currency} {atStake.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} at stake
        </p>
      )}

      <div className="ot-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`ot-tab ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {pending.length > 0 && (
        <div style={{ display: 'flex', gap: 8, margin: '4px 0 16px' }}>
          <Button size="sm" onClick={selectAll}>Select all</Button>
          <Button size="sm" onClick={clearSelection}>Clear</Button>
          <Button size="sm" variant="primary" disabled={selected.size === 0} onClick={approveSelected}>
            <CheckCheck size={14} /> Approve selected ({selected.size})
          </Button>
        </div>
      )}

      <SectionLabel right={<span className="mono count">{pending.length}</span>}>{pending.length} {pending.length === 1 ? 'entry' : 'entries'} waiting</SectionLabel>
      <Card>
        {pending.length === 0 ? (
          <EmptyState title="Nothing pending" body="Every extra-time entry in this period has been decided." />
        ) : (
          <div className="ot-table">
            {grouped.map(([date, items]) => (
              <div key={date} className="ot-day-group">
                <div className="ot-day-group-head">
                  <span>
                    <strong>{date}</strong>
                    {items[0].day.holiday && <span className="ot-sub"> · {items[0].day.holidayName || 'holiday'} — every hour is overtime</span>}
                    <span className="ot-sub"> · {items.length} {items.length === 1 ? 'entry' : 'entries'}</span>
                  </span>
                  <Button size="sm" onClick={() => writeApprovals(items)}>Approve this day in full</Button>
                </div>
                {items.map((it) => (
                  <div key={it.key} className="ot-approval-row">
                    <Checkbox checked={selected.has(it.key)} onChange={() => toggle(it.key)} label={`Select ${it.emp.name} ${it.rec.s}-${it.rec.e}`} />
                    <div className="ot-name-cell">
                      <button className="ot-link-btn" onClick={() => onOpenPerson(it.emp)}>{it.emp.name}</button>
                      <span className="ot-sub">{it.emp.desig || '—'}{it.rec.kind === 'callout' && ' · call-out'}</span>
                    </div>
                    <span className="win">{it.rec.s}–{it.rec.e}</span>
                    <span className="mono ot-cell">{hm(it.rec.min)}</span>
                    <HHMMField
                      className="ot-hhmm mono"
                      minutes={minutesFor(it)}
                      onCommit={(mins) => setOverrides((cur) => ({ ...cur, [it.key]: mins }))}
                      aria-label={`Approve minutes for ${it.emp.name} ${it.rec.s}-${it.rec.e}`}
                    />
                    <Button size="sm" onClick={() => writeApprovals([it])}>Approve</Button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
