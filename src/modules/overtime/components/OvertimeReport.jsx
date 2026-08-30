import { useState } from 'react';
import { Card, SectionLabel, Field, Input, Select, Button, EmptyState } from '../../../core/ui/components';
import { Search } from 'lucide-react';
import { runRange, hm, dparse } from '../lib/overtimeEngine';

const fmtDow = (k) => dparse(k).toLocaleDateString(undefined, { weekday: 'short' });
const fmtDate = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const money = (n, cfg) => `${cfg.currency} ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One row per overtime entry, HRMS-report style: date, punch window, raw
 *  duration, the approval cap and what it actually authorised, and any
 *  reason typed against it. */
function EntryRows({ days }) {
  const rows = [];
  days.forEach((day) => {
    if (day.recs.length === 0 && !day.open) return;
    day.recs.forEach((rec, i) => {
      const authorised = rec.app ? Math.min(rec.appMin, rec.min) : null;
      const capped = authorised != null && authorised < rec.min;
      rows.push(
        <tr key={`${day.d}-${rec.id}`} className={day.holiday || day.dow === 6 ? 'ot-entry-off' : ''}>
          <td>
            {i === 0 && (
              <>
                {fmtDate(day.d)}<div className="ot-sub">{fmtDow(day.d)}{day.holiday ? ` · ${day.holidayName || 'Friday'}` : ''}</div>
                {day.open && <span className="ot-chip-warn">Incomplete working hours</span>}
              </>
            )}
          </td>
          <td className="mono num">{rec.s || '—'}</td>
          <td className="mono num">{rec.e || '—'}</td>
          <td className="num">
            <span className="mono">{hm(rec.min)}</span>
            {capped && <div className="ot-sub ot-authorised-note">{hm(authorised)} authorised</div>}
          </td>
          <td className="num">
            {rec.app ? (
              <span className="ot-approved-badge">{hm(authorised)}</span>
            ) : (
              <span className="ot-chip-warn">Pending — cap {hm(rec.appMin)}</span>
            )}
          </td>
          <td>{rec.note || <span className="ot-sub">—</span>}</td>
        </tr>
      );
    });
    if (day.recs.length === 0 && day.open) {
      rows.push(
        <tr key={day.d}>
          <td>{fmtDate(day.d)}<div className="ot-sub">{fmtDow(day.d)}</div></td>
          <td colSpan={4}><span className="ot-chip-warn">No check-out on file — nothing claimed</span></td>
          <td />
        </tr>
      );
    }
  });
  return rows;
}

/** The two HRMS-style summary panels: totals before approval ("All") vs.
 *  after it ("Approved") — the same two numbers as the stat tiles above,
 *  broken down the way payroll actually reads them: holiday-rate hours,
 *  general hours, the combined monthly total, and the resulting % of basic. */
function SummaryPanel({ title, tone, r, cfg }) {
  return (
    <div className={`ot-summary-card ${tone}`}>
      <div className="ot-summary-card-head">{title}</div>
      <div className="ot-summary-row"><span>Friday / public holiday OT</span><span className="mono">{hm(r.pubOT)}</span></div>
      <div className="ot-summary-row"><span>General days OT</span><span className="mono">{hm(r.genOT)}</span></div>
      <div className="ot-summary-row"><span>Monthly OT total</span><span className="mono">{hm(r.genOT + r.pubOT)}</span></div>
      <div className="ot-summary-row ot-summary-strong"><span>Overtime %</span><span className="mono">{r.pct.toFixed(2)}% · {money(r.amount, cfg)}</span></div>
    </div>
  );
}

/**
 * A pure lookup — pick a staff member and a range, press Search, read the
 * numbers. No approvals, no editing, no side effects: for when you just
 * need to answer "what happened for this person in this window," not
 * change anything about it. The entry table and the two summary panels
 * mirror the HRMS overtime report's at-a-glance layout the client already
 * knows, sitting alongside (not replacing) Daybook's own stat tiles.
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
    setResult({
      emp, from, to,
      r: runRange(emp, from, to, ctx, {}),
      approvedR: runRange(emp, from, to, ctx, { approved: true }),
    });
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

          <SectionLabel>Overtime log — {fmtDate(result.from)} to {fmtDate(result.to)}</SectionLabel>
          <div style={{ overflowX: 'auto' }}>
            <table className="ot-proj-table ot-report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Start</th>
                  <th className="num">End</th>
                  <th className="num">Duration</th>
                  <th className="num">Approved</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                <EntryRows days={result.r.days} />
              </tbody>
            </table>
          </div>
          {result.r.blockedMin > 0 && (
            <p className="ot-sub">
              Incomplete working hours: {hm(result.r.blockedMin)} — worked beyond duty time and counted toward the
              weekly required hours, but not yet past the 48h line, so not paid as overtime and not in the totals below.
            </p>
          )}

          <SectionLabel>All overtimes vs. approved overtimes</SectionLabel>
          <div className="ot-summary-grid">
            <SummaryPanel title={`All overtimes (${fmtDate(result.from)} – ${fmtDate(result.to)})`} tone="" r={result.r} cfg={cfg} />
            <SummaryPanel title={`Approved overtimes (${fmtDate(result.from)} – ${fmtDate(result.to)})`} tone="is-approved" r={result.approvedR} cfg={cfg} />
          </div>
        </>
      )}

      {!result && (
        <EmptyState title="No search yet" body="Choose a staff member and a range, then press Search." />
      )}
    </>
  );
}
