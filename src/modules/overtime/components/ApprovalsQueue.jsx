import { useMemo, useState } from 'react';
import { Card, SectionLabel, EmptyState, Button, Checkbox } from '../../../core/ui/components';
import { CheckCheck } from 'lucide-react';
import { hm, rateOf, dparse } from '../lib/overtimeEngine';
import { HHMMField } from './HHMMField';

const TABS = [
  ['all', 'Everything'],
  ['callout', 'Call-outs only'],
  ['extension', 'Duty extensions only'],
];

const GROUP_MODES = [
  ['date', 'Group by date'],
  ['staff', 'Group by staff'],
];

const dowShort = (k) => dparse(k).toLocaleDateString(undefined, { weekday: 'short' });

/** Every hour of a Friday or a declared public holiday is overtime; a
 *  declared "off" day behaves like a Saturday instead — distinct enough
 *  from each other, and from an ordinary day, to call out visually rather
 *  than bury in the date text. */
function DayBadge({ day }) {
  if (day.holiday) return <span className="ot-day-badge is-holiday">{day.holidayName || 'Friday'}</span>;
  if (day.isOff) return <span className="ot-day-badge is-off">Off day</span>;
  return null;
}

const dayRowClass = (day) => (day.holiday ? 'is-holiday' : day.isOff ? 'is-off' : '');

function ColumnHead({ leadLabel }) {
  return (
    <div className="ot-approval-grid-row ot-approval-grid-head">
      <span />
      <span>{leadLabel}</span>
      <span>Time</span>
      <span>Duration</span>
      <span>Approve</span>
      <span />
    </div>
  );
}

function ApprovalRow({ it, checked, onToggle, primary, secondary, minutes, onOverride, onApprove }) {
  return (
    <div className={`ot-approval-grid-row ${dayRowClass(it.day)}`}>
      <Checkbox checked={checked} onChange={onToggle} label={`Select ${it.emp.name} ${it.rec.s}-${it.rec.e}`} />
      <div className="ot-name-cell">
        {primary}
        {secondary && <span className="ot-sub">{secondary}</span>}
      </div>
      <span className="win mono">{it.rec.s}–{it.rec.e}</span>
      <span className="mono ot-cell">{hm(it.rec.min)}</span>
      <HHMMField
        className="ot-hhmm mono"
        minutes={minutes}
        onCommit={onOverride}
        aria-label={`Approve minutes for ${it.emp.name} ${it.rec.s}-${it.rec.e}`}
      />
      <Button size="sm" onClick={onApprove}>Approve</Button>
    </div>
  );
}

/**
 * Cross-staff worklist of pending extra-time entries, filterable to
 * call-outs or duty extensions (surfaced separately per HANDOVER.md so
 * emergency trips-in can be decided on their own), and grouped either by
 * date (one block per day, every staff member's entries for it) or by
 * staff (one block per person, their own entries date by date — the HRMS
 * layout the client already knows). Every entry gets its own hh:mm field,
 * editable before it's approved — bulk approval uses whatever is currently
 * in that field, not always the recorded length.
 */
export function ApprovalsQueue({ rows, cfg, dayOf, patchDay, onOpenPerson }) {
  const [tab, setTab] = useState('all');
  const [staffFilter, setStaffFilter] = useState('ALL');
  const [groupMode, setGroupMode] = useState('date');
  const [selected, setSelected] = useState(new Set());
  const [overrides, setOverrides] = useState({}); // key -> minutes

  const pending = useMemo(() => {
    const items = [];
    rows.forEach((row) => {
      if (staffFilter !== 'ALL' && row.e.no !== staffFilter) return;
      row.fc.actual.days.forEach((day) => {
        day.recs.forEach((rec) => {
          if (rec.app) return;
          if (tab !== 'all' && rec.kind !== tab) return;
          items.push({ key: `${row.e.no}|${day.d}|${rec.id}`, emp: row.e, date: day.d, day, rec });
        });
      });
    });
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [rows, tab, staffFilter]);

  const itemsByKey = useMemo(() => new Map(pending.map((it) => [it.key, it])), [pending]);

  const groupedByDate = useMemo(() => {
    const byDate = new Map();
    pending.forEach((it) => { (byDate.get(it.date) || byDate.set(it.date, []).get(it.date)).push(it); });
    return [...byDate.entries()];
  }, [pending]);

  const groupedByStaff = useMemo(() => {
    const byStaff = new Map();
    pending.forEach((it) => {
      if (!byStaff.has(it.emp.no)) byStaff.set(it.emp.no, { emp: it.emp, items: [] });
      byStaff.get(it.emp.no).items.push(it);
    });
    return [...byStaff.values()].sort((a, b) => a.emp.name.localeCompare(b.emp.name));
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

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 4 }}>
        <div className="ot-tabs" role="tablist" style={{ marginBottom: 0 }}>
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`ot-tab ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="ot-tabs" role="tablist" style={{ marginBottom: 0 }}>
          {GROUP_MODES.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={groupMode === id} className={`ot-tab ${groupMode === id ? 'is-on' : ''}`} onClick={() => setGroupMode(id)}>{label}</button>
          ))}
        </div>
        <label className="ot-filter">
          <span className="eyebrow">Staff</span>
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
            <option value="ALL">All staff</option>
            {[...rows].sort((a, b) => a.e.name.localeCompare(b.e.name)).map((row) => (
              <option key={row.e.no} value={row.e.no}>{row.e.name}</option>
            ))}
          </select>
        </label>
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
        ) : groupMode === 'date' ? (
          <div className="ot-table">
            {groupedByDate.map(([date, items]) => (
              <div key={date} className={`ot-day-group ${dayRowClass(items[0].day)}`}>
                <div className="ot-day-group-head">
                  <span>
                    <strong className="mono">{date}</strong> <span className="ot-dow">({dowShort(date)})</span>
                    <DayBadge day={items[0].day} />
                    <span className="ot-sub"> · {items.length} {items.length === 1 ? 'entry' : 'entries'}</span>
                  </span>
                  <Button size="sm" onClick={() => writeApprovals(items)}>Approve this day in full</Button>
                </div>
                <ColumnHead leadLabel="Staff" />
                {items.map((it) => (
                  <ApprovalRow
                    key={it.key} it={it}
                    checked={selected.has(it.key)} onToggle={() => toggle(it.key)}
                    primary={<button className="ot-link-btn" onClick={() => onOpenPerson(it.emp)}>{it.emp.name}</button>}
                    secondary={`${it.emp.desig || '—'}${it.rec.kind === 'callout' ? ' · call-out' : ''}`}
                    minutes={minutesFor(it)}
                    onOverride={(mins) => setOverrides((cur) => ({ ...cur, [it.key]: mins }))}
                    onApprove={() => writeApprovals([it])}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="ot-table">
            {groupedByStaff.map((group) => (
              <div key={group.emp.no} className="ot-day-group">
                <div className="ot-day-group-head">
                  <div className="ot-name-cell">
                    <button className="ot-link-btn" onClick={() => onOpenPerson(group.emp)}>{group.emp.name}</button>
                    <span className="ot-sub">{group.emp.desig || '—'} · {group.items.length} {group.items.length === 1 ? 'entry' : 'entries'}</span>
                  </div>
                  <Button size="sm" onClick={() => writeApprovals(group.items)}>Approve all for this staff</Button>
                </div>
                <ColumnHead leadLabel="Date" />
                {group.items.map((it) => (
                  <ApprovalRow
                    key={it.key} it={it}
                    checked={selected.has(it.key)} onToggle={() => toggle(it.key)}
                    primary={<span className="mono">{it.date} <span className="ot-dow">({dowShort(it.date)})</span></span>}
                    secondary={(it.day.holiday || it.day.isOff) ? <DayBadge day={it.day} /> : null}
                    minutes={minutesFor(it)}
                    onOverride={(mins) => setOverrides((cur) => ({ ...cur, [it.key]: mins }))}
                    onApprove={() => writeApprovals([it])}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
