import { useMemo, useState } from 'react';
import { Card, SectionLabel, EmptyState, Button, Checkbox } from '../../../core/ui/components';
import { CheckCheck } from 'lucide-react';
import { hm } from '../lib/overtimeEngine';

/**
 * Cross-staff worklist of pending extra-time entries, grouped by date and
 * filterable to call-outs (emergency trips in, surfaced separately per
 * HANDOVER.md so they can be decided on their own). Bulk-approves at their
 * currently-proposed length; per-entry hh:mm editing lives in PersonView.
 */
export function ApprovalsQueue({ rows, dayOf, patchDay, onOpenPerson }) {
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState(new Set());

  const pending = useMemo(() => {
    const items = [];
    rows.forEach((row) => {
      row.all.days.forEach((day) => {
        day.recs.forEach((rec) => {
          if (rec.app) return;
          if (tab === 'callout' && rec.kind !== 'callout') return;
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

  const toggle = (key) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const approveSelected = () => {
    const groups = new Map(); // "empNo|date" -> [item, ...]
    selected.forEach((key) => {
      const it = itemsByKey.get(key);
      if (!it) return;
      const gk = `${it.emp.no}|${it.date}`;
      (groups.get(gk) || groups.set(gk, []).get(gk)).push(it);
    });
    groups.forEach((items, gk) => {
      const [empNo, date] = gk.split('|');
      const raw = dayOf(empNo, date) || {};
      const appr = { ...(raw.appr || {}) };
      items.forEach(({ rec }) => { appr[rec.id] = { app: true, appMin: rec.appMin != null ? rec.appMin : rec.min }; });
      patchDay(empNo, date, { appr });
    });
    setSelected(new Set());
  };

  return (
    <>
      <div className="ot-tabs">
        {[['all', 'All'], ['callout', 'Call-outs']].map(([id, label]) => (
          <button key={id} className={`ot-tab ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <SectionLabel right={<span className="mono count">{pending.length}</span>}>Pending approval</SectionLabel>
      <Card>
        {pending.length === 0 ? (
          <EmptyState title="Nothing pending" body="Every extra-time entry in this period has been decided." />
        ) : (
          <div className="ot-table">
            {grouped.map(([date, items]) => (
              <div key={date} className="ot-day">
                <div className="ot-day-head"><span className="d">{date}</span></div>
                {items.map((it) => (
                  <div key={it.key} className="ot-rec">
                    <Checkbox checked={selected.has(it.key)} onChange={() => toggle(it.key)} label={`Select ${it.emp.name} ${it.rec.s}-${it.rec.e}`} />
                    <button className="ot-name" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }} onClick={() => onOpenPerson(it.emp)}>
                      {it.emp.name}
                    </button>
                    <span className="win">{it.rec.s}–{it.rec.e}</span>
                    <span className="mono">{hm(it.rec.min)}</span>
                    {it.rec.kind === 'callout' && <span className="ot-sub">call-out</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      {selected.size > 0 && (
        <div style={{ position: 'sticky', bottom: 12, marginTop: 10 }}>
          <Button variant="primary" onClick={approveSelected}>
            <CheckCheck size={15} /> Approve {selected.size} at proposed length
          </Button>
        </div>
      )}
    </>
  );
}
