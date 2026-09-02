import { useMemo, useState } from 'react';
import { Card, SectionLabel, EmptyState, Button, Checkbox } from '../../../core/ui/components';
import { Check, CheckCheck } from 'lucide-react';
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

const MODE_TABS = [
  ['pending', 'Pending'],
  ['approved', 'Approved'],
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

function ApprovalRow({ it, mode, checked, onToggle, primary, secondary, minutes, onOverride, onApprove, onReopen }) {
  return (
    <div className={`ot-approval-grid-row ${dayRowClass(it.day)}`}>
      <Checkbox checked={checked} onChange={onToggle} label={`Select ${it.emp.name} ${it.rec.s}-${it.rec.e}`} />
      <div className="ot-name-cell">
        {primary}
        {secondary && <span className="ot-sub">{secondary}</span>}
        {/* Imported from HRMS as "Incomplete Working Hours": genuinely
            worked, counted toward the weekly requirement, and deliberately
            never paid there. Approving it here is a real override that
            pushes this person's total above HRMS's, so say so plainly
            rather than letting it look like any other pending entry. */}
        {it.rec.holdUntilApproved && (
          <span className="ot-chip-warn" style={{ whiteSpace: 'normal' }}>
            Counted toward weekly hours — not paid by HRMS
          </span>
        )}
      </div>
      <span className="win mono">{it.rec.s}–{it.rec.e}</span>
      <span className="mono ot-cell">{hm(it.rec.min)}</span>
      {mode === 'approved' ? (
        <button
          type="button" className="ot-approved-btn"
          onClick={onReopen}
          aria-label={`Approved ${hm(it.rec.appMin)} for ${it.emp.name} ${it.rec.s}-${it.rec.e} — click to reopen`}
        >
          <Check size={12} /> {hm(it.rec.appMin)}
        </button>
      ) : (
        <HHMMField
          className="ot-hhmm mono"
          minutes={minutes}
          onCommit={onOverride}
          aria-label={`Approve minutes for ${it.emp.name} ${it.rec.s}-${it.rec.e}`}
        />
      )}
      {mode !== 'approved' && <Button size="sm" onClick={onApprove}>Approve</Button>}
    </div>
  );
}

/**
 * Cross-staff worklist of overtime entries, toggled between what's waiting
 * on a decision and what's already been decided (an "Approved" mode lets a
 * supervisor reopen and adjust something already approved — the same
 * reopen-pill Person View's attendance calendar's stat tiles show, moved
 * here since entry-level approval is a decision, and Approvals is where
 * decisions live). Filterable to call-outs or duty extensions (surfaced
 * separately per HANDOVER.md so emergency trips-in can be decided on their
 * own), and grouped either by date (one block per day, every staff member's
 * entries for it) or by staff (one block per person, their own entries date
 * by date — the HRMS layout the client already knows). Every pending entry
 * gets its own hh:mm field, editable before it's approved — bulk approval
 * uses whatever is currently in that field, not always the recorded length.
 */
export function ApprovalsQueue({ rows, cfg, dayOf, patchDay, onOpenPerson }) {
  const [mode, setMode] = useState('pending');
  const [tab, setTab] = useState('all');
  const [staffFilter, setStaffFilter] = useState('ALL');
  const [groupMode, setGroupMode] = useState('date');
  const [selected, setSelected] = useState(new Set());
  const [overrides, setOverrides] = useState({}); // key -> minutes

  const items = useMemo(() => {
    const list = [];
    rows.forEach((row) => {
      if (staffFilter !== 'ALL' && row.e.no !== staffFilter) return;
      row.fc.actual.days.forEach((day) => {
        day.recs.forEach((rec) => {
          if (mode === 'pending' ? rec.app : !rec.app) return;
          if (tab !== 'all' && rec.kind !== tab) return;
          list.push({ key: `${row.e.no}|${day.d}|${rec.id}`, emp: row.e, date: day.d, day, rec });
        });
      });
    });
    // Oldest first, and within a day by start time — the order HRMS lists a
    // person's overtime in, so the two can be read side by side.
    return list.sort((a, b) => a.date.localeCompare(b.date) || (a.rec.s || '').localeCompare(b.rec.s || ''));
  }, [rows, tab, staffFilter, mode]);

  const itemsByKey = useMemo(() => new Map(items.map((it) => [it.key, it])), [items]);

  const groupedByDate = useMemo(() => {
    const byDate = new Map();
    items.forEach((it) => { (byDate.get(it.date) || byDate.set(it.date, []).get(it.date)).push(it); });
    return [...byDate.entries()];
  }, [items]);

  const groupedByStaff = useMemo(() => {
    const byStaff = new Map();
    items.forEach((it) => {
      if (!byStaff.has(it.emp.no)) byStaff.set(it.emp.no, { emp: it.emp, items: [] });
      byStaff.get(it.emp.no).items.push(it);
    });
    return [...byStaff.values()].sort((a, b) => a.emp.name.localeCompare(b.emp.name));
  }, [items]);

  const minutesFor = (it) => (overrides[it.key] != null ? overrides[it.key] : (it.rec.appMin ?? it.rec.min));

  const totalMinutes = items.reduce((s, it) => s + (mode === 'pending' ? it.rec.min : it.rec.appMin), 0);
  const totalAmount = items.reduce((s, it) => {
    const mult = it.day.holiday ? cfg.publicMult : cfg.generalMult;
    const mins = mode === 'pending' ? minutesFor(it) : it.rec.appMin;
    return s + (mins / 60) * rateOf(it.emp, cfg) * mult;
  }, 0);

  const toggle = (key) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const selectAll = () => setSelected(new Set(items.map((it) => it.key)));
  const clearSelection = () => setSelected(new Set());

  const decideItems = (its, approve) => {
    const groups = new Map(); // "empNo|date" -> [item, ...]
    its.forEach((it) => {
      const gk = `${it.emp.no}|${it.date}`;
      (groups.get(gk) || groups.set(gk, []).get(gk)).push(it);
    });
    groups.forEach((group, gk) => {
      const [empNo, date] = gk.split('|');
      const raw = dayOf(empNo, date) || {};
      const appr = { ...(raw.appr || {}) };
      group.forEach((it) => {
        appr[it.rec.id] = approve ? { app: true, appMin: minutesFor(it) } : { app: false, appMin: it.rec.appMin };
      });
      patchDay(empNo, date, { appr });
    });
  };
  const writeApprovals = (its) => decideItems(its, true);
  const reopenItems = (its) => decideItems(its, false);

  const approveSelected = () => {
    writeApprovals([...selected].map((k) => itemsByKey.get(k)).filter(Boolean));
    setSelected(new Set());
  };

  const isPending = mode === 'pending';

  return (
    <>
      {items.length > 0 && (
        <p className="ot-sub" style={{ marginBottom: 12 }}>
          {hm(totalMinutes)} {isPending ? 'recorded' : 'approved'} · {cfg.currency} {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {isPending ? 'at stake' : 'cleared'}
        </p>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 4 }}>
        <div className="ot-tabs" role="tablist" style={{ marginBottom: 0 }}>
          {MODE_TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={mode === id} className={`ot-tab ${mode === id ? 'is-on' : ''}`} onClick={() => { setMode(id); setSelected(new Set()); }}>{label}</button>
          ))}
        </div>
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

      {isPending && items.length > 0 && (
        <div style={{ display: 'flex', gap: 8, margin: '4px 0 16px' }}>
          <Button size="sm" onClick={selectAll}>Select all</Button>
          <Button size="sm" onClick={clearSelection}>Clear</Button>
          <Button size="sm" variant="primary" disabled={selected.size === 0} onClick={approveSelected}>
            <CheckCheck size={14} /> Approve selected ({selected.size})
          </Button>
        </div>
      )}

      <SectionLabel right={<span className="mono count">{items.length}</span>}>
        {items.length} {items.length === 1 ? 'entry' : 'entries'} {isPending ? 'waiting' : 'approved'}
      </SectionLabel>
      <Card>
        {items.length === 0 ? (
          <EmptyState
            title={isPending ? 'Nothing pending' : 'Nothing approved yet'}
            body={isPending ? 'Every extra-time entry in this period has been decided.' : 'Approved entries for this period will show up here.'}
          />
        ) : groupMode === 'date' ? (
          <div className="ot-table">
            {groupedByDate.map(([date, dayItems]) => (
              <div key={date} className={`ot-day-group ${dayRowClass(dayItems[0].day)}`}>
                <div className="ot-day-group-head">
                  <span>
                    <strong className="mono">{date}</strong> <span className="ot-dow">({dowShort(date)})</span>
                    <DayBadge day={dayItems[0].day} />
                    <span className="ot-sub"> · {dayItems.length} {dayItems.length === 1 ? 'entry' : 'entries'}</span>
                  </span>
                  {isPending ? (
                    <Button size="sm" onClick={() => writeApprovals(dayItems)}>Approve this day in full</Button>
                  ) : (
                    <Button size="sm" onClick={() => reopenItems(dayItems)}>Reopen this day</Button>
                  )}
                </div>
                <ColumnHead leadLabel="Staff" />
                {dayItems.map((it) => (
                  <ApprovalRow
                    key={it.key} it={it} mode={mode}
                    checked={selected.has(it.key)} onToggle={() => toggle(it.key)}
                    primary={<button className="ot-link-btn" onClick={() => onOpenPerson(it.emp)}>{it.emp.name}</button>}
                    secondary={`${it.emp.desig || '—'}${it.rec.kind === 'callout' ? ' · call-out' : ''}`}
                    minutes={minutesFor(it)}
                    onOverride={(mins) => setOverrides((cur) => ({ ...cur, [it.key]: mins }))}
                    onApprove={() => writeApprovals([it])}
                    onReopen={() => reopenItems([it])}
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
                  {isPending ? (
                    <Button size="sm" onClick={() => writeApprovals(group.items)}>Approve all for this staff</Button>
                  ) : (
                    <Button size="sm" onClick={() => reopenItems(group.items)}>Reopen all for this staff</Button>
                  )}
                </div>
                <ColumnHead leadLabel="Date" />
                {group.items.map((it) => (
                  <ApprovalRow
                    key={it.key} it={it} mode={mode}
                    checked={selected.has(it.key)} onToggle={() => toggle(it.key)}
                    primary={<span className="mono">{it.date} <span className="ot-dow">({dowShort(it.date)})</span></span>}
                    secondary={(it.day.holiday || it.day.isOff) ? <DayBadge day={it.day} /> : null}
                    minutes={minutesFor(it)}
                    onOverride={(mins) => setOverrides((cur) => ({ ...cur, [it.key]: mins }))}
                    onApprove={() => writeApprovals([it])}
                    onReopen={() => reopenItems([it])}
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
