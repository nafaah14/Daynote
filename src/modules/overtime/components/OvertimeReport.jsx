import { useEffect, useState } from 'react';
import { Card, SectionLabel, Field, Input, Select, Button, EmptyState } from '../../../core/ui/components';
import { PdfPreviewScreen } from '../../../core/ui/PdfPreview';
import { Search, FileText, Check } from 'lucide-react';
import { hm, dparse, entryState, creditedMin, recordedMin } from '../lib/overtimeEngine';
import { eraRange } from '../lib/legacyCfg';
import { HHMMField } from './HHMMField';

const loadPdfGen = () => import('../lib/pdfGen');

const fmtDow = (k) => dparse(k).toLocaleDateString(undefined, { weekday: 'short' });
const fmtDate = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const money = (n, cfg) => `${cfg.currency} ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SOURCE_LABEL = { card: 'Card', hrms: 'HRMS', manual: 'Manual' };

/** Public holiday, Friday, and a declared off day read differently to
 *  payroll — a holiday pays every hour worked as OT regardless of the 48h
 *  line, an off day is an ordinary Saturday-like day off, so they get their
 *  own distinct badges rather than one generic "special day" marker. A
 *  Friday that's also a specifically named holiday shows its real name,
 *  since holidayName() already prefers that over the plain "Friday" label. */
function DayKindBadge({ day }) {
  if (day.holiday) return <span className="ot-day-badge is-holiday">{day.holidayName === 'Friday' ? 'Friday' : `Public holiday — ${day.holidayName}`}</span>;
  if (day.isOff) return <span className="ot-day-badge is-off">Off day</span>;
  return null;
}

/**
 * One OT entry, with everything that fed the day's total actually visible:
 * which clock window, which source produced it (so an HRMS claim and the
 * card estimate it replaced are never both silently in play), whether it's
 * paid yet, and — right here, not on a separate Approvals screen — the
 * control to decide it.
 */
function EntryRow({ emp, day, rec, onApprove, onReopen, onConfirmLimit, genCum, pubCum }) {
  const state = entryState(rec);
  const [amt, setAmt] = useState(rec.app ? rec.appMin : (rec.limitMin ?? rec.appMin ?? rec.min));
  const credited = creditedMin(rec);

  return (
    <tr className={day.holiday || day.isOff ? 'ot-entry-off' : ''}>
      <td className="mono num">{rec.s || '—'}</td>
      <td className="mono num">{rec.e || '—'}</td>
      <td><span className="ot-source-chip" data-source={rec.source}>{SOURCE_LABEL[rec.source] || rec.source}</span></td>
      <td className="num mono">{hm(rec.min)}</td>
      <td className="num">
        {state === 'paid' ? (
          <button type="button" className="ot-approved-btn" onClick={() => onReopen(rec)} aria-label={`Approved ${hm(Math.min(rec.appMin, rec.min))} for ${emp.name} ${rec.s}-${rec.e} — click to reopen`}>
            <Check size={12} /> {hm(Math.min(rec.appMin, rec.min))}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <HHMMField className="ot-hhmm mono" minutes={amt} onCommit={setAmt} aria-label={`Approve minutes for ${emp.name} ${rec.s}-${rec.e}`} />
            {/* Two separate decisions, matching HRMS: confirming how much of
                this stretch was genuine work (governs the 48h credit only)
                is not the same decision as approving it for pay. */}
            <Button size="sm" onClick={() => onConfirmLimit(rec, amt)}>Confirm limit</Button>
            <Button size="sm" onClick={() => onApprove(rec, amt)}>Approve</Button>
          </div>
        )}
      </td>
      <td>
        {/* What this entry contributes toward the 48h weekly requirement —
            separate from "Recorded" and "Approved" on purpose, since it's
            neither: HRMS caps it at what it actually authorised for the
            day (creditedMin), never the raw card-to-card length, exactly
            the way a late card-out isn't credited as work past that
            cutoff. Shown for every not-yet-paid entry, so the weekly-line
            figure this page relies on is never something to take on
            trust — and says plainly whether that figure is still just
            HRMS's own default or has actually been confirmed. */}
        {state !== 'paid' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {state === 'unpaid' && (
              <span className="ot-chip-warn" style={{ whiteSpace: 'normal' }}>Counted toward weekly hours — not paid by HRMS</span>
            )}
            <span className="ot-sub">
              {rec.limitMin != null
                ? `Confirmed: ${hm(credited)} toward the 48h weekly line`
                : `${hm(credited)} toward the 48h weekly line${credited < rec.min ? ` (HRMS's default — capped from ${hm(rec.min)} on the card)` : ''}`}
            </span>
          </div>
        )}
      </td>
      <td>{rec.note || <span className="ot-sub">—</span>}</td>
      <td className="num mono">{hm(genCum)}</td>
      <td className="num mono">{hm(pubCum)}</td>
    </tr>
  );
}

/** One row per day: date, what kind of day it was, duty/credit, then every
 *  OT entry recorded against it. A day with nothing recorded and nothing
 *  open just doesn't appear — there's nothing to check.
 *
 *  Carries a running total of every entry's own recordedMin — deliberately
 *  the same pick eraRange's "All overtimes" panel sums, not creditedMin
 *  (the 48h-line figure each row already states separately): those are
 *  different quantities — credited counts held/incomplete time too, All
 *  never does — so a running credited total would never reconcile with
 *  either summary panel below it, no matter how correctly it added up.
 *  This one is built to land on exactly the same number "All overtimes"
 *  shows by the last row, split into general and Friday/public-holiday by
 *  that day's own `holiday` flag — the same split the summary panels use —
 *  so a mid-period read ("how much by the 10th") is checkable against a
 *  total actually on screen. */
function DayRows({ emp, days, onApprove, onReopen, onConfirmLimit }) {
  const rows = [];
  let genCum = 0, pubCum = 0;
  days.forEach((day) => {
    if (day.recs.length === 0 && !day.open) return;
    rows.push(
      <tr key={`${day.d}-head`} className="ot-day-head-row">
        <td colSpan={9}>
          <strong>{fmtDate(day.d)}</strong> <span className="ot-dow">({fmtDow(day.d)})</span>
          <DayKindBadge day={day} />
          <span className="ot-sub" style={{ marginLeft: 10 }}>duty {hm(day.duty)} · credited {hm(day.credit)}</span>
          {day.open && <span className="ot-chip-warn" style={{ marginLeft: 8 }}>Incomplete working hours</span>}
        </td>
      </tr>
    );
    if (day.recs.length === 0 && day.open) {
      rows.push(
        <tr key={day.d}>
          <td colSpan={9}><span className="ot-chip-warn">No check-out on file — nothing claimed</span></td>
        </tr>
      );
      return;
    }
    const isPub = day.holiday || day.status === 'holiday'; // matches legacyCfg.js's rebucket() exactly
    day.recs.forEach((rec) => {
      if (isPub) pubCum += recordedMin(rec); else genCum += recordedMin(rec);
      rows.push(
        <EntryRow
          key={`${day.d}-${rec.id}`} emp={emp} day={day} rec={rec}
          onApprove={(r, amt) => onApprove(day.d, r, amt)}
          onReopen={(r) => onReopen(day.d, r)}
          onConfirmLimit={(r, amt) => onConfirmLimit(day.d, r, amt)}
          genCum={genCum} pubCum={pubCum}
        />
      );
    });
  });
  return rows;
}

/** The two HRMS-style summary panels: totals before approval ("All") vs.
 *  after it ("Approved"). Both figures are exactly what eraRange returns,
 *  which is itself a plain sum over the rows rendered above — see
 *  eraRange's own invariant test — so nothing here can silently disagree
 *  with what's on screen. */
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
 * The Overtime module's authoritative surface: pick a staff member and a
 * range, and see exactly what the % is built from — every day, every entry,
 * its source, its state, and the control to decide it. Nothing here is
 * computed anywhere else; the totals below are eraRange's own sum over the
 * same days these rows render (see its invariant test), so a wrong number
 * is visible by comparing a row to the total, not by comparing to HRMS.
 */
export function OvertimeReport({ employees, ctx, cfg, period, patchDay, jumpTo, onJumpHandled }) {
  const [personId, setPersonId] = useState('');
  const [rangeMode, setRangeMode] = useState('period'); // 'period' | 'custom'
  const [customFrom, setCustomFrom] = useState(period.from);
  const [customTo, setCustomTo] = useState(period.to);
  const [result, setResult] = useState(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState(null);

  // Landing here from Overview's "Pending decisions" list — jump straight to
  // that person's entries for the range they were counted over, without
  // making anyone re-pick what was already chosen one screen up. Computed
  // directly (not via `search()`, which reads state that wouldn't be updated
  // yet in this same effect) and cleared via the callback so it only fires
  // once per click.
  useEffect(() => {
    if (!jumpTo) return;
    const emp = employees.find((e) => e.no === jumpTo.personId);
    if (emp) {
      setPersonId(jumpTo.personId);
      setRangeMode('custom');
      setCustomFrom(jumpTo.from);
      setCustomTo(jumpTo.to);
      setResult({
        emp, from: jumpTo.from, to: jumpTo.to,
        r: eraRange(emp, jumpTo.from, jumpTo.to, ctx, {}),
        approvedR: eraRange(emp, jumpTo.from, jumpTo.to, ctx, { approved: true }),
      });
    }
    onJumpHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo]);

  useEffect(() => {
    if (!pdfOpen || !result) return;
    let cancelled = false;
    setPdfBlob(null);
    (async () => {
      const { generateIndividualOtPdf } = await loadPdfGen();
      const blob = generateIndividualOtPdf(result.emp, result.r, result.approvedR, cfg, result.from, result.to);
      if (!cancelled) setPdfBlob(blob);
    })();
    return () => { cancelled = true; };
  }, [pdfOpen, result, cfg]);

  const search = () => {
    const emp = employees.find((e) => e.no === personId);
    if (!emp) return;
    const from = rangeMode === 'custom' ? customFrom : period.from;
    const to = rangeMode === 'custom' ? customTo : period.to;
    if (!from || !to || from > to) return;
    // eraRange, not runRange: a range spanning 1 Aug 2026 has to measure
    // each date under the rules that actually applied to it — the old
    // ungated system before the changeover, the 48h weekly line after it.
    setResult({
      emp, from, to,
      r: eraRange(emp, from, to, ctx, {}),
      approvedR: eraRange(emp, from, to, ctx, { approved: true }),
    });
  };

  // `patchDay`'s write lands in the repo's own state, which only re-renders
  // this component (with a new `ctx`, carrying a new `dayOf`) on the NEXT
  // render — calling eraRange again synchronously right after `patchDay`
  // would still see the pre-write data, since React batches that state
  // update. So the re-query has to be a reaction to `ctx` actually changing,
  // not something fired inline from the click handler.
  useEffect(() => {
    if (!result) return;
    setResult((cur) => ({
      ...cur,
      r: eraRange(cur.emp, cur.from, cur.to, ctx, {}),
      approvedR: eraRange(cur.emp, cur.from, cur.to, ctx, { approved: true }),
    }));
    // Deliberately excludes `result` — this only re-derives from the
    // existing snapshot when the underlying data changes, never on its own
    // output, or it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // Each of these merges onto whatever the entry's appr record already
  // holds, rather than replacing it outright — approving must not lose a
  // previously confirmed limit (it's just unused while paid, in case of a
  // later reopen), and confirming a limit must never touch app/appMin,
  // since that decision belongs to Approve alone.
  const patchAppr = (date, id, patch) => {
    const raw = ctx.dayOf(result.emp.no, date) || {};
    const existing = (raw.appr || {})[id] || {};
    patchDay(result.emp.no, date, { appr: { ...(raw.appr || {}), [id]: { ...existing, ...patch } } });
  };
  const approveEntry = (date, rec, appMin) => patchAppr(date, rec.id, { app: true, appMin });
  const reopenEntry = (date, rec) => patchAppr(date, rec.id, { app: false, appMin: rec.appMin });
  const confirmLimit = (date, rec, limitMin) => patchAppr(date, rec.id, { limitMin });

  if (pdfOpen) {
    const date = new Date().toISOString().slice(0, 10);
    return (
      <PdfPreviewScreen
        title={result.emp.name} blob={pdfBlob} onClose={() => setPdfOpen(false)}
        fileName={`${result.emp.name.replace(/\s+/g, '_')}_Overtime_${date}.pdf`}
      />
    );
  }

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
            {result && (
              <Button onClick={() => setPdfOpen(true)}><FileText size={14} /> Report</Button>
            )}
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
                  <th className="num">Start</th>
                  <th className="num">End</th>
                  <th>Source</th>
                  <th className="num">Recorded</th>
                  <th className="num">Approved</th>
                  <th></th>
                  <th>Reason</th>
                  <th className="num">All OT so far (gen.)</th>
                  <th className="num">All OT so far (Fri/PH)</th>
                </tr>
              </thead>
              <tbody>
                <DayRows emp={result.emp} days={result.r.days} onApprove={approveEntry} onReopen={reopenEntry} onConfirmLimit={confirmLimit} />
              </tbody>
            </table>
          </div>
          {result.r.incompleteMin > 0 && (
            <p className="ot-sub">
              Incomplete working hours: {hm(result.r.incompleteMin)} — worked beyond duty time and counted toward the
              weekly required hours, so not paid as overtime and not included in the totals below.
            </p>
          )}
          {(() => {
            const auto = result.r.days.reduce(
              (s, d) => s + d.recs.filter((r) => r.autoApproved).reduce((a, r) => a + Math.min(r.appMin, r.min), 0), 0);
            return auto > 0 ? (
              <p className="ot-sub">
                Includes {hm(auto)} approved automatically on import — these were still pending in HRMS, but their
                salary period had already closed. Reopen any of them above to exclude them.
              </p>
            ) : null;
          })()}

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
