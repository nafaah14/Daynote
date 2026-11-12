import { useState } from 'react';
import { X } from 'lucide-react';
import { Sheet, Button, Checkbox, Input, Select, Chip } from '../../core/ui/components';
import { monthName, dmy } from './lib/report';
import { checkTarget } from './lib/powerlog';

/**
 * Review a Powerlog import before it touches the report. Each routine check
 * shows the work matched to it and a dropdown of every job in the Powerlog
 * report, so a check the matcher missed can be filled by hand. Everything
 * else is a proposed task you can untick, rename, re-date, give a %, or
 * send to Routine instead.
 */

const span = (a, b) => (!a && !b ? 'No dates' : a === b || !b ? dmy(a || b) : `${dmy(a)} → ${dmy(b)}`);
const short = (t, n = 90) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

const STATUS = { COMPLETED: 'Completed', ONGOING: 'Ongoing', CANCELLED: 'Cancelled' };

export default function ImportSheet({ month, source, plan, onApply, onClose }) {
  const [items, setItems] = useState(plan.items);
  const dropped = new Set(plan.dropped);

  const setItem = (key, patch) => setItems(items.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const assign = (key, check) => setItem(key, { to: `check:${check}`, include: true });
  const unassign = (it) => setItem(it.key, { to: 'tasks', include: it.status !== 'CANCELLED' });

  const forCheck = (c) => items.filter((it) => checkTarget(it.to) === c && it.include);
  const free = items.filter((it) => !checkTarget(it.to));
  const pickable = [...free].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const tasks = free;

  const filled = plan.checks.filter((c) => forCheck(c).length).length;
  const chosen = tasks.filter((it) => it.include && it.details.trim()).length;
  const blanks = tasks.filter((it) => it.include && it.to === 'tasks' && it.pct === '').length;
  const wrongMonth = source.period && source.period !== month;

  return (
    <Sheet
      open wide onClose={onClose} title="Import from Powerlog"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!chosen && !filled} onClick={() => { onApply({ ...plan, items }); onClose(); }}>
            Add to report
          </Button>
        </>
      }
    >
      <p className="ur-hint">
        {source.period ? monthName(source.period) : 'Unknown period'} · {source.tasks.length} Powerlog tasks →{' '}
        {filled} of {plan.checks.length} routine checks filled, {chosen} tasks.
        {wrongMonth && <strong className="ur-warn"> This PDF is for {monthName(source.period)}, not {monthName(month)}.</strong>}
      </p>

      <div className="ur-imp-head">Routine checks</div>
      {plan.checks.length === 0 && <p className="ur-hint">No routine checks on this report.</p>}
      {plan.checks.map((c) => {
        const work = forCheck(c);
        const starts = work.map((w) => w.start).filter(Boolean).sort();
        const ends = work.map((w) => w.end).filter(Boolean).sort();
        return (
          <div key={c} className="ur-imp-check">
            <div className="ur-imp-title">
              {c}
              {dropped.has(c) && <span className="ur-imp-tag">not on this report — added back if given work</span>}
            </div>
            <div className="ur-imp-meta">
              {work.length ? <>Fills <strong>{span(starts[0], ends[ends.length - 1])}</strong></> : 'Nothing from Powerlog — stays blank'}
            </div>
            {work.map((w) => (
              <div key={w.key} className="ur-imp-work">
                <span>{span(w.start, w.end)} · {short(w.source)}</span>
                <button type="button" className="icon-btn" title="Not this one" aria-label={`Remove ${w.source}`} onClick={() => unassign(w)}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <Select value="" onChange={(e) => e.target.value && assign(e.target.value, c)} aria-label={`Pick work for ${c}`}>
              <option value="">{work.length ? 'Add another from the Powerlog report…' : 'Pick from the Powerlog report…'}</option>
              <optgroup label="Routine in Powerlog">
                {pickable.filter((it) => it.routineType).map((it) => (
                  <option key={it.key} value={it.key}>{dmy(it.start)} · {short(it.source)}{it.status === 'CANCELLED' ? ' (cancelled)' : ''}</option>
                ))}
              </optgroup>
              <optgroup label="Other tasks">
                {pickable.filter((it) => !it.routineType).map((it) => (
                  <option key={it.key} value={it.key}>{dmy(it.start)} · {short(it.source)}{it.status === 'CANCELLED' ? ' (cancelled)' : ''}</option>
                ))}
              </optgroup>
            </Select>
          </div>
        );
      })}

      <div className="ur-imp-head">
        Tasks / projects
        <span className="ur-imp-tools">
          {blanks > 0 && (
            <Chip onClick={() => setItems(items.map((it) => (!checkTarget(it.to) && it.include && it.to === 'tasks' && it.pct === '' ? { ...it, pct: '100' } : it)))}>
              Blank % → 100 ({blanks})
            </Chip>
          )}
          <Chip onClick={() => setItems(items.map((it) => (checkTarget(it.to) ? it : { ...it, include: it.status !== 'CANCELLED' })))}>All</Chip>
          <Chip onClick={() => setItems(items.map((it) => (checkTarget(it.to) ? it : { ...it, include: false })))}>None</Chip>
        </span>
      </div>
      {tasks.map((it) => (
        <div key={it.key} className={`ur-imp-row ${it.include ? '' : 'is-off'}`}>
          <Checkbox checked={it.include} label={`Include ${it.details}`} onChange={(v) => setItem(it.key, { include: v })} />
          <div className="ur-imp-body">
            <Input value={it.details} onChange={(e) => setItem(it.key, { details: e.target.value })} disabled={!it.include} />
            <div className="ur-imp-meta">
              {span(it.start, it.end)}
              {' · '}<span className={`ur-st ur-st-${it.status.toLowerCase()}`}>{STATUS[it.status] || it.status}</span>
              {it.count > 1 && ` · ${it.count} Powerlog tasks`}
              {it.routineType && <span className="ur-imp-tag">Routine in Powerlog</span>}
              {it.matchRowId && it.to === 'tasks' && <span className="ur-imp-tag is-update">updates the row already on the report</span>}
            </div>
            {it.include && (
              <div className="ur-imp-ctrls">
                {it.to === 'tasks' && (
                  <Input className="input ur-imp-pct" value={it.pct} placeholder="%" inputMode="numeric"
                    onChange={(e) => setItem(it.key, { pct: e.target.value })} aria-label="Completion %" />
                )}
                <Select value={it.to} onChange={(e) => setItem(it.key, { to: e.target.value })} aria-label="Section">
                  <option value="tasks">Tasks / projects</option>
                  <option value="routine">Routine — new row</option>
                  {plan.checks.length > 0 && (
                    <optgroup label="Counts as routine check">
                      {plan.checks.map((c) => <option key={c} value={`check:${c}`}>{c}</option>)}
                    </optgroup>
                  )}
                </Select>
                <Input value={it.remarks} placeholder="Remarks" onChange={(e) => setItem(it.key, { remarks: e.target.value })} />
              </div>
            )}
          </div>
        </div>
      ))}
    </Sheet>
  );
}
