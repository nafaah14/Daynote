import { useState } from 'react';
import { Card, SectionLabel, Field, Input, Select, Button, EmptyState } from '../../../core/ui/components';
import { Search } from 'lucide-react';
import { runRange, hm, dparse } from '../lib/overtimeEngine';

const fmtDow = (k) => dparse(k).toLocaleDateString(undefined, { weekday: 'short' });
const fmtDate = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const money = (n, cfg) => `${cfg.currency} ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A pure lookup — pick a staff member and a range, press Search, read the
 * numbers. No approvals, no editing, no side effects: for when you just
 * need to answer "what happened for this person in this window," not
 * change anything about it.
 */
export function OvertimeReport({ employees, ctx, cfg, period }) {
  const [personId, setPersonId] = useState('');
  const [rangeMode, setRangeMode] = useState('period'); // 'period' | 'custom'
  const [customFrom, setCustomFrom] = useState(period.from);
  const [customTo, setCustomTo] = useState(period.to);
  const [result, setResult] = useState(null);

  const search = () => {
    const emp = employees.find((e) => e.no === personId);
    if (!emp) return;
    const from = rangeMode === 'custom' ? customFrom : period.from;
    const to = rangeMode === 'custom' ? customTo : period.to;
    if (!from || !to || from > to) return;
    setResult({ emp, from, to, r: runRange(emp, from, to, ctx, {}) });
  };

  return (
    <>
      <Card>
        <div className="pad" style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Staff">
            <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Choose staff…</option>
              {[...employees].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
                <option key={e.no} value={e.no}>{e.name}</option>
              ))}
            </Select>
          </Field>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Range">
              <Select value={rangeMode} onChange={(e) => setRangeMode(e.target.value)}>
                <option value="period">{period.label}</option>
                <option value="custom">Custom range…</option>
              </Select>
            </Field>
            {rangeMode === 'custom' && (
              <>
                <Field label="From"><Input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} /></Field>
                <Field label="To"><Input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} /></Field>
              </>
            )}
            <Button variant="primary" onClick={search} disabled={!personId}><Search size={14} /> Search</Button>
          </div>
        </div>
      </Card>

      {result && (
        <>
          <div className="ot-stats" style={{ marginTop: 16 }}>
            <div className="ot-stat accent-amber"><div className="k">Worked</div><div className="v">{hm(result.r.worked)}</div></div>
            <div className="ot-stat accent-slate"><div className="k">General OT</div><div className="v">{hm(result.r.genOT)}</div></div>
            <div className="ot-stat accent-teal"><div className="k">Holiday OT</div><div className="v">{hm(result.r.pubOT)}</div></div>
            <div className={`ot-stat accent-red ${result.r.pct >= (cfg.alertPct || 50) ? 'warn' : ''}`}>
              <div className="k">% of basic</div>
              <div className="v">{result.r.pct.toFixed(1)}<small>%</small></div>
              <div className="ot-sub">{money(result.r.amount, cfg)}</div>
            </div>
          </div>

          <SectionLabel>Daily breakdown — {fmtDate(result.from)} to {fmtDate(result.to)}</SectionLabel>
          <Card>
            {result.r.days.map((day) => (
              <div key={day.d} className="ot-day">
                <div className="ot-day-head">
                  <span className="d">{day.d} <span className="ot-dow">({fmtDow(day.d)})</span> · {day.status}{day.holiday ? ` (${day.holidayName})` : ''}</span>
                  {day.open && <span className="ot-chip-warn">Incomplete working hours</span>}
                  <span className="meta">duty {hm(day.duty)} · extra {hm(day.extra)} · genOT {hm(day.genOT)} · pubOT {hm(day.pubOT)}</span>
                </div>
                {day.recs.map((rec) => (
                  <div key={rec.id} className="ot-rec">
                    <span className="win">{rec.s}–{rec.e}</span>
                    <span className="mono">{hm(rec.min)}</span>
                    <span className={rec.app ? 'ot-approved-badge' : 'ot-chip-warn'}>
                      {rec.app ? `Approved ${hm(rec.appMin)}` : 'Pending'}
                    </span>
                    {rec.kind === 'callout' && <span className="ot-sub">call-out</span>}
                    {rec.kind === 'manual' && <span className="ot-sub">manual</span>}
                  </div>
                ))}
              </div>
            ))}
          </Card>
        </>
      )}

      {!result && (
        <EmptyState title="No search yet" body="Choose a staff member and a range, then press Search." />
      )}
    </>
  );
}
