import { useEffect, useRef, useState } from 'react';
import { Timer, Copy, Check, X, Plus, ArrowRightToLine, Undo2, History, BookmarkCheck } from 'lucide-react';
import { Card, Button, SectionLabel, Sheet } from '../../core/ui/components';
import {
  parseHHMM, formatHHMM, formatLong, toDecimal, worked, sumMinutes, runningTotals, crossingIndex,
} from './lib/hhmm';
import {
  loadState, saveState, blankWorked, blankHour, weekOfHours, sendToHours, makeEntry, pushHistory, DAYS,
} from './lib/store';
import './timecalc.css';

function CopyButton({ text, label = 'Copy', compact = false }) {
  const [done, setDone] = useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch { /* clipboard blocked */ }
  };
  if (compact) {
    return (
      <button type="button" className="icon-btn" aria-label={label} title={label} onClick={copy}>
        {done ? <Check size={15} /> : <Copy size={15} />}
      </button>
    );
  }
  return (
    <Button size="sm" onClick={copy}>{done ? <Check size={13} /> : <Copy size={13} />} {done ? 'Copied' : label}</Button>
  );
}

/**
 * A time box that takes "0800", "800" or "8:00" and shows back "08:00" once
 * you leave it, so what was understood is always visible. A value that can't
 * be read stays as typed, outlined, with the reason on hover/long-press.
 */
function TimeField({ value, onChange, clock = false, label, id, onEnter, placeholder = 'hh:mm' }) {
  const r = parseHHMM(value, { clock });
  const bad = !r.ok && !r.empty;
  const commit = () => { if (r.ok) onChange(formatHHMM(r.minutes)); };
  return (
    <input
      className={`input tc-time${bad ? ' is-bad' : ''}`} type="text" inputMode="numeric" autoComplete="off"
      spellCheck={false} maxLength={6} placeholder={placeholder} value={value} aria-label={label} enterKeyHint="next"
      aria-invalid={bad || undefined} title={bad ? r.error : undefined} data-tc={id}
      onChange={(e) => onChange(e.target.value.replace(/[^\d:]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); onEnter?.(); } }}
    />
  );
}

const focusField = (id) => setTimeout(() => document.querySelector(`[data-tc="${id}"]`)?.focus(), 30);

/**
 * "This is the final total" — the calculation keeps updating as you type, and
 * only this button commits a line to history. The note says whose hours it was.
 */
function SaveBar({ kind, state, update, total, onSave }) {
  return (
    <div className="tc-save">
      <input
        className="input tc-note" tabIndex={-1} placeholder="Note (optional) — whose hours?"
        value={state.note[kind]} onChange={(e) => update({ note: { ...state.note, [kind]: e.target.value } })} aria-label="Note for history"
      />
      <Button variant="primary" size="sm" disabled={!total} onClick={onSave}><BookmarkCheck size={14} /> Save total</Button>
    </div>
  );
}

/* ------------------------------ worked time ----------------------------- */

function WorkedTab({ state, update, onSend, onSave }) {
  const rows = state.worked.map((l) => {
    const s = parseHHMM(l.start, { clock: true });
    const e = parseHHMM(l.end, { clock: true });
    return { l, res: s.ok && e.ok ? worked(s.minutes, e.minutes) : null };
  });
  const total = sumMinutes(rows.map((x) => (x.res ? x.res.minutes : NaN)));
  const setLine = (id, patch) => update({ worked: state.worked.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const add = () => {
    const line = blankWorked();
    update({ worked: [...state.worked, line] });
    focusField(`${line.id}-start`);
  };
  const remove = (id) => update({ worked: state.worked.length > 1 ? state.worked.filter((l) => l.id !== id) : [blankWorked()] });
  const summary = [
    ...rows.filter((x) => x.res).map(({ l, res }) => `${l.label ? `${l.label}: ` : ''}${l.start} to ${l.end} = ${formatHHMM(res.minutes)}${res.nextDay ? ' (next day)' : ''}`),
    `Total ${formatHHMM(total)}`,
  ].join('\n');
  const last = state.worked[state.worked.length - 1].id;

  return (
    <>
      <p className="tc-hint">Start and finish of each overtime (or any) stretch. Type <b>1500</b> and <b>1738</b> — no colon needed.</p>
      {rows.map(({ l, res }) => (
        <Card key={l.id} className="tc-line">
          <input
            className="input tc-label" tabIndex={-1} placeholder="Label (optional) — day or name" value={l.label}
            onChange={(e) => setLine(l.id, { label: e.target.value })} aria-label="Label"
          />
          <div className="tc-worked">
            <label className="tc-cap">Start
              <TimeField
                clock id={`${l.id}-start`} label="Start time" value={l.start} onChange={(v) => setLine(l.id, { start: v })}
                onEnter={() => focusField(`${l.id}-end`)}
              />
            </label>
            <label className="tc-cap">Finish
              <TimeField
                clock id={`${l.id}-end`} label="Finish time" value={l.end} onChange={(v) => setLine(l.id, { end: v })}
                onEnter={() => (l.id === last ? add() : focusField(`${state.worked[state.worked.findIndex((x) => x.id === l.id) + 1].id}-start`))}
              />
            </label>
            <div className="tc-res">
              <span className="tc-res-main">{res ? formatHHMM(res.minutes) : '—'}</span>
              <span className="tc-res-sub">
                {res ? `${formatLong(res.minutes)} · ${toDecimal(res.minutes)} h` : 'hh:mm'}
                {res?.nextDay && <span className="tc-tag">next day</span>}
              </span>
            </div>
          </div>
          <div className="tc-actions">
            {res && <CopyButton compact text={formatHHMM(res.minutes)} label="Copy this result" />}
            {res && (
              <button type="button" className="icon-btn" aria-label="Add to hours list" title="Add to hours list" onClick={() => onSend(l.label, formatHHMM(res.minutes))}>
                <ArrowRightToLine size={15} />
              </button>
            )}
            <button type="button" className="icon-btn" aria-label="Remove line" title="Remove line" onClick={() => remove(l.id)}><X size={15} /></button>
          </div>
        </Card>
      ))}
      <Button size="sm" onClick={add}><Plus size={13} /> Add line</Button>
      <Card className="tc-total">
        <div>
          <span className="tc-total-label">Total worked</span>
          <span className="tc-total-val">{formatHHMM(total)}</span>
          <span className="tc-res-sub">{formatLong(total)} · {toDecimal(total)} h</span>
        </div>
        <div className="tc-total-actions">
          <CopyButton text={formatHHMM(total)} label="Copy total" />
          <CopyButton text={summary} label="Copy all" />
        </div>
        <SaveBar
          kind="worked" state={state} update={update} total={total}
          onSave={() => onSave(total, rows.filter((x) => x.res).map(({ l }) => `${l.start}–${l.end}`).join(' + '))}
        />
      </Card>
    </>
  );
}

/* ------------------------------- add hours ------------------------------ */

function HoursTab({ state, update, onSave }) {
  const parsed = state.hours.map((h) => parseHHMM(h.value));
  const vals = parsed.map((p) => (p.ok ? p.minutes : NaN));
  const running = runningTotals(vals);
  const total = sumMinutes(vals);
  const tgt = parseHHMM(state.target);
  const target = tgt.ok ? tgt.minutes : 48 * 60;
  const reachedAt = crossingIndex(vals, target);
  const diff = total - target;
  const setLine = (id, patch) => update({ hours: state.hours.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  const add = () => {
    const line = blankHour(DAYS[state.hours.length % 7]);
    update({ hours: [...state.hours, line] });
    focusField(`${line.id}-v`);
  };
  const remove = (id) => update({ hours: state.hours.length > 1 ? state.hours.filter((h) => h.id !== id) : [blankHour()] });
  const targetLabel = formatHHMM(target);
  const status = diff >= 0
    ? `${diff === 0 ? 'Exactly on' : `Over by ${formatHHMM(diff)} —`} ${diff === 0 ? targetLabel : `past ${targetLabel}`}`
    : `${formatHHMM(-diff)} remaining to ${targetLabel}`;
  const summary = [
    ...state.hours.map((h, i) => (parsed[i].ok ? `${h.label ? `${h.label} ` : ''}${formatHHMM(parsed[i].minutes)}` : null)).filter(Boolean),
    `Total ${formatHHMM(total)}`,
    diff > 0 ? `Over ${targetLabel} by ${formatHHMM(diff)}` : `${formatHHMM(Math.max(-diff, 0))} to ${targetLabel}`,
  ].join('\n');

  return (
    <>
      <p className="tc-hint">Add up hours, not clock times. Type <b>0800</b>, <b>1000</b>… and watch the running total.</p>
      <Card className="tc-target">
        <label className="tc-cap">Weekly line
          <TimeField id="target" label="Weekly target" value={state.target} onChange={(v) => update({ target: v })} />
        </label>
        <span className="tc-res-sub">Edit if the limit changes — it’s remembered.</span>
      </Card>
      <Card className="tc-hours">
        {state.hours.map((h, i) => (
          <div key={h.id} className={`tc-hrow${reachedAt === i ? ' is-reached' : ''}`}>
            <input
              className="input tc-hlabel" tabIndex={-1} value={h.label} placeholder="Label" aria-label="Label"
              onChange={(e) => setLine(h.id, { label: e.target.value })}
            />
            <TimeField
              id={`${h.id}-v`} label={`${h.label || 'Line'} hours`} value={h.value} onChange={(v) => setLine(h.id, { value: v })}
              onEnter={() => (i === state.hours.length - 1 ? add() : focusField(`${state.hours[i + 1].id}-v`))}
            />
            <span className="tc-run" title="Running total">{Number.isFinite(vals[i]) ? formatHHMM(running[i]) : ''}</span>
            <button type="button" className="icon-btn" tabIndex={-1} aria-label="Remove line" onClick={() => remove(h.id)}><X size={15} /></button>
            {reachedAt === i && <span className="tc-reached">Reaches {targetLabel} here</span>}
          </div>
        ))}
        <Button size="sm" onClick={add}><Plus size={13} /> Add line</Button>
      </Card>
      <Card className={`tc-total${diff >= 0 ? ' is-over' : ''}`}>
        <div>
          <span className="tc-total-label">Total hours</span>
          <span className="tc-total-val">{formatHHMM(total)}</span>
          <span className="tc-res-sub">{formatLong(total)} · {toDecimal(total)} h</span>
          <span className="tc-status">{status}</span>
        </div>
        <div className="tc-total-actions">
          <CopyButton text={formatHHMM(total)} label="Copy total" />
          {diff > 0 && <CopyButton text={formatHHMM(diff)} label="Copy over" />}
          <CopyButton text={summary} label="Copy all" />
        </div>
        <SaveBar
          kind="hours" state={state} update={update} total={total}
          onSave={() => onSave(total, diff > 0 ? `Over ${targetLabel} by ${formatHHMM(diff)}` : '')}
        />
      </Card>
    </>
  );
}

/* ---------------------------------- history ---------------------------------- */

const when = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function HistorySheet({ open, onClose, history, onRemove, onClearAll }) {
  const [sure, setSure] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="History">
      {history.length === 0 ? (
        <p className="tc-hint">Nothing yet. Press <b>Save total</b> when a calculation is final and it will appear here.</p>
      ) : (
        <>
          <div className="tc-hist">
            {history.map((h) => (
              <div key={h.id} className="tc-hitem">
                <div className="tc-hmain">
                  <span className="tc-hval">{formatHHMM(h.total)}</span>
                  <span className="tc-hkind">{h.kind === 'hours' ? 'Added hours' : 'Worked time'}</span>
                </div>
                <div className="tc-hsub">
                  {[h.note, h.detail, when(h.at)].filter(Boolean).join(' · ')}
                </div>
                <div className="tc-hactions">
                  <CopyButton compact text={formatHHMM(h.total)} label="Copy" />
                  <button type="button" className="icon-btn" aria-label="Delete" onClick={() => onRemove(h.id)}><X size={15} /></button>
                </div>
              </div>
            ))}
          </div>
          <Button
            size="sm" onClick={() => { if (sure) { onClearAll(); setSure(false); } else setSure(true); }}
          >{sure ? 'Tap again to delete all history' : 'Clear history'}</Button>
        </>
      )}
    </Sheet>
  );
}

/* --------------------------------- screen -------------------------------- */

function TimeCalcScreen() {
  const [state, setState] = useState(loadState);
  const [undo, setUndo] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const timer = useRef(null);

  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const update = (patch) => setState((s) => ({ ...s, ...patch }));
  const tab = state.tab;

  const clear = () => {
    if (!confirm) {
      setConfirm(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setConfirm(false), 3000);
      return;
    }
    setConfirm(false);
    setUndo({ kind: 'clear', tab, worked: state.worked, hours: state.hours, note: state.note });
    update({ ...fresh(tab), note: { ...state.note, [tab]: '' } });
  };
  const fresh = (kind) => (kind === 'worked' ? { worked: [blankWorked()] } : { hours: weekOfHours() });
  /** Commit the current total to history and start the sheet over. Undo puts both back. */
  const save = (kind, total, detail) => {
    const entry = makeEntry({ kind, total, note: state.note[kind], detail });
    setUndo({ kind: 'save', tab: kind, worked: state.worked, hours: state.hours, note: state.note, savedId: entry.id });
    update({ ...fresh(kind), note: { ...state.note, [kind]: '' }, history: pushHistory(state.history, entry) });
  };
  const restore = () => {
    if (!undo) return;
    update({
      worked: undo.worked, hours: undo.hours, note: undo.note, tab: undo.tab,
      ...(undo.savedId ? { history: state.history.filter((h) => h.id !== undo.savedId) } : {}),
    });
    setUndo(null);
  };
  const send = (label, value) => update({ hours: sendToHours(state.hours, label, value), tab: 'hours' });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Time Calc</h1>
          <p className="page-sub">Saved on this device until you clear it.</p>
        </div>
      </div>
      <div className="tc-tabs" role="tablist">
        {[['worked', 'Worked time'], ['hours', 'Add hours']].map(([id, label]) => (
          <button
            key={id} type="button" role="tab" aria-selected={tab === id}
            className={`tc-tab${tab === id ? ' is-on' : ''}`} onClick={() => update({ tab: id })}
          >{label}</button>
        ))}
      </div>
      <SectionLabel right={(
        <span className="tc-clear">
          {undo && <button type="button" className="tc-undo" onClick={restore}><Undo2 size={13} /> {undo.kind === 'save' ? 'Undo save' : 'Undo clear'}</button>}
          <button type="button" className="tc-histbtn" onClick={() => setShowHistory(true)}>
            <History size={13} /> History{state.history.length ? ` (${state.history.length})` : ''}
          </button>
          <button type="button" className={`tc-clearbtn${confirm ? ' is-confirm' : ''}`} onClick={clear}>
            {confirm ? 'Tap again to clear' : 'Clear'}
          </button>
        </span>
      )}
      >{tab === 'worked' ? 'Start → finish' : 'Hours to add'}</SectionLabel>
      {tab === 'worked'
        ? <WorkedTab state={state} update={update} onSend={send} onSave={(total, detail) => save('worked', total, detail)} />
        : <HoursTab state={state} update={update} onSave={(total, detail) => save('hours', total, detail)} />}
      <HistorySheet
        open={showHistory} onClose={() => setShowHistory(false)} history={state.history}
        onRemove={(id) => update({ history: state.history.filter((h) => h.id !== id) })}
        onClearAll={() => update({ history: [] })}
      />
    </div>
  );
}

export default {
  id: 'timecalc',
  title: 'Time Calc',
  icon: Timer,
  accent: 'var(--accent-timecalc)',
  tier: 'integrated',
  routes: [{ path: '/timecalc', element: <TimeCalcScreen /> }],
  renderRef: (record) => <span className="ref-chip">{record.title}</span>,
  search: (_ctx, q) => (q.length >= 2 && ['time calc', 'overtime calculator', 'hours', 'worked time', 'ot'].some((w) => w.startsWith(q))
    ? [{ id: 'timecalc', title: 'Time Calc', sub: 'Worked time and hours adder', to: '/timecalc' }]
    : []),
  quickActions: [{ id: 'open-timecalc', label: 'Time Calc', icon: Timer, to: '/timecalc' }],
};
