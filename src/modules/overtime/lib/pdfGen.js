/**
 * PDF generation for Overtime — same jsPDF + jspdf-autotable pattern as
 * orgstructure/pdfGen.js (header bar, autoTable, footer page numbers),
 * reused rather than reinvented since it already produces properly
 * paginated, real PDF output. Returns a Blob; the caller previews it via
 * core/ui/PdfPreview's PdfPreviewScreen.
 */
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import { hm, dparse, rateOf } from './overtimeEngine';

applyPlugin(jsPDF);

const money = (n, cfg) => `${cfg.currency} ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (k) => dparse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDow = (k) => dparse(k).toLocaleDateString(undefined, { weekday: 'short' });

function addHeader(doc, margin, y, title, subtitle) {
  doc.setFontSize(7).setTextColor(130, 130, 130);
  doc.text('STELCO', margin, y + 3);
  y += 5;
  doc.setFontSize(14).setTextColor(20, 20, 20).setFont(undefined, 'bold');
  doc.text(title, margin, y + 5);
  y += 8;
  doc.setFontSize(8).setTextColor(80, 80, 80).setFont(undefined, 'normal');
  doc.text(subtitle, margin, y + 3);
  return y + 8;
}

function addFooters(doc, note) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const pages = doc.internal.getNumberOfPages();
  const dateStr = new Date().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(6).setTextColor(150, 150, 150);
    const line = note ? `${note}  ·  Generated ${dateStr}  ·  Page ${i} of ${pages}` : `Generated ${dateStr}  ·  Page ${i} of ${pages}`;
    doc.text(line, pw / 2, ph - 5, { align: 'center' });
  }
}

const HEAD_STYLE = { fillColor: [240, 240, 245], textColor: [80, 80, 80], fontStyle: 'bold', fontSize: 7 };
const BODY_STYLE = { fontSize: 8, cellPadding: 2.5, lineWidth: 0.1, lineColor: [210, 210, 210], textColor: [30, 30, 30] };

/* ================================================================
   1. STAFF OVERVIEW — the Staff tab's own actual-to-date + projected
   figures, minus the "Awaiting decision" columns.
   ================================================================ */
export function generateStaffOverviewPdf(rows, cfg, asOf, periodTo, unitLabel) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = 12;
  let y = margin;
  y = addHeader(
    doc, margin, y, 'Staff Overview',
    `${unitLabel || 'All units'} · ${rows.length} staff · to ${fmtDate(asOf)}, projected to ${fmtDate(periodTo)}`
  );

  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Staff', 'Worked', 'Holiday', 'General', 'OT hours', '% of basic', 'Proj. OT hours', 'Proj. % of basic', 'Proj. amount']],
    body: rows.map((r) => [
      `${r.e.name}\n${r.e.sid} · ${r.e.desig || '—'}`,
      hm(r.fc.actual.worked), hm(r.fc.actual.pubOT), hm(r.fc.actual.genOT), hm(r.fc.actual.otMin),
      `${r.fc.actual.pct.toFixed(1)}%`,
      hm(r.fc.projected.genOT + r.fc.projected.pubOT),
      `${r.fc.projected.pct.toFixed(1)}%`,
      money(r.fc.projected.amount, cfg),
    ]),
    styles: BODY_STYLE,
    headStyles: HEAD_STYLE,
    columnStyles: { 0: { cellWidth: 52 } },
    theme: 'grid',
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 7) {
        const r = rows[data.row.index];
        if (r.fc.projected.pct >= (cfg.alertPct || 50)) data.cell.styles.textColor = [179, 38, 30];
      }
    },
  });

  addFooters(doc);
  return doc.output('blob');
}

/* ================================================================
   2. INDIVIDUAL STAFF OT REPORT — one person's summary + entry-level log,
   mirroring OvertimeReport.jsx's own on-screen layout.
   ================================================================ */
export function generateIndividualOtPdf(employee, allResult, approvedResult, cfg, from, to) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 12;
  let y = margin;
  y = addHeader(
    doc, margin, y, employee.name,
    `${employee.sid} · ${employee.desig || '—'}${employee.unit ? ` · ${employee.unit}` : ''} · ${fmtDate(from)} – ${fmtDate(to)}`
  );

  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['', 'Friday / public holiday OT', 'General days OT', 'Monthly OT total', 'Overtime %', 'Amount']],
    body: [
      ['All overtimes', hm(allResult.pubOT), hm(allResult.genOT), hm(allResult.genOT + allResult.pubOT), `${allResult.pct.toFixed(2)}%`, money(allResult.amount, cfg)],
      ['Approved overtimes', hm(approvedResult.pubOT), hm(approvedResult.genOT), hm(approvedResult.genOT + approvedResult.pubOT), `${approvedResult.pct.toFixed(2)}%`, money(approvedResult.amount, cfg)],
    ],
    styles: { ...BODY_STYLE, fontSize: 7.5 },
    headStyles: HEAD_STYLE,
    columnStyles: { 0: { cellWidth: 32, fontStyle: 'bold' } },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 6;

  doc.setFontSize(9).setTextColor(20, 20, 20).setFont(undefined, 'bold');
  doc.text(`Overtime log`, margin, y);
  y += 4;

  const entryRows = [];
  allResult.days.forEach((day) => {
    if (day.recs.length === 0 && !day.open) return;
    day.recs.forEach((rec, i) => {
      const authorised = rec.app ? Math.min(rec.appMin, rec.min) : null;
      entryRows.push([
        i === 0 ? `${fmtDate(day.d)}\n${fmtDow(day.d)}${day.holiday ? ` · ${day.holidayName || 'Friday'}` : ''}` : '',
        rec.s || '—', rec.e || '—', hm(rec.min),
        rec.app ? hm(authorised) : `Pending (cap ${hm(rec.appMin)})`,
        rec.note || '—',
      ]);
    });
    if (day.recs.length === 0 && day.open) {
      entryRows.push([`${fmtDate(day.d)}\n${fmtDow(day.d)}`, '', '', 'No check-out on file — nothing claimed', '', '']);
    }
  });

  if (entryRows.length === 0) {
    doc.setFontSize(8).setTextColor(120, 120, 120).setFont(undefined, 'normal');
    doc.text('No overtime entries in this range.', margin, y + 4);
  } else {
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Date', 'Start', 'End', 'Duration', 'Approved', 'Reason']],
      body: entryRows,
      styles: { ...BODY_STYLE, fontSize: 7.5 },
      headStyles: HEAD_STYLE,
      theme: 'grid',
    });
  }

  addFooters(doc, 'Individual staff overtime report');
  return doc.output('blob');
}

/* ================================================================
   3. UNIT OVERTIME REPORT — closed-period, approved-basis figures for
   every staff member, shaped like the HRMS export.
   ================================================================ */
export function generateUnitOtPdf(rows, cfg, from, to, unitLabel) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = 12;
  let y = margin;
  y = addHeader(doc, margin, y, 'Unit Overtime Report', `${unitLabel || 'All units'} · ${rows.length} staff · ${fmtDate(from)} – ${fmtDate(to)}`);

  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [[
      'Staff', 'Total OT', 'Total amount',
      'Public approved OT', 'Public approved amount',
      'General approved OT', 'General approved amount',
      'Approved OT', 'Approved amount',
      'All OT%', 'Approved OT%',
    ]],
    body: rows.map(({ e, all, approved }) => {
      const rate = rateOf(e, cfg);
      const pubAmt = (approved.pubOT / 60) * rate * cfg.publicMult;
      const genAmt = (approved.genOT / 60) * rate * cfg.generalMult;
      return [
        `${e.name}\n${e.sid} · ${e.desig || '—'}`,
        hm(all.otMin), money(all.amount, cfg),
        hm(approved.pubOT), money(pubAmt, cfg),
        hm(approved.genOT), money(genAmt, cfg),
        hm(approved.otMin), money(approved.amount, cfg),
        `${all.pct.toFixed(2)}%`, `${approved.pct.toFixed(2)}%`,
      ];
    }),
    styles: { ...BODY_STYLE, fontSize: 6.5 },
    headStyles: { ...HEAD_STYLE, fontSize: 6 },
    columnStyles: { 0: { cellWidth: 40 } },
    theme: 'grid',
  });

  addFooters(doc, 'Approved-basis totals for the closed period');
  return doc.output('blob');
}

/* ================================================================
   4. UNIT OT COMPARISON — old (pre-Aug-2026, 35h) vs new (48h) rules,
   for the same period, reconstructed from attendance data.
   `legacyRows`: [{ e, otMin, amount, pct }] — see legacyCfg.js's
   legacyTotals(), priced at today's live rate/multiplier settings.
   ================================================================ */
export function generateOtComparisonPdf(newRows, legacyRows, cfg, from, to, unitLabel) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = 12;
  let y = margin;
  y = addHeader(doc, margin, y, 'Unit OT Comparison — Old vs New System', `${unitLabel || 'All units'} · ${newRows.length} staff · ${fmtDate(from)} – ${fmtDate(to)}`);

  const legacyByNo = new Map(legacyRows.map((r) => [r.e.no, r]));

  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Staff', 'Old OT (35h rules)', 'Old %', 'New OT (48h rules)', 'New %', 'Difference (hrs)', 'Difference (%)']],
    body: newRows.map(({ e, result: newR }) => {
      const legacy = legacyByNo.get(e.no) || { otMin: 0, amount: 0, pct: 0 };
      const diffMin = newR.otMin - legacy.otMin;
      const diffPct = newR.pct - legacy.pct;
      return [
        `${e.name}\n${e.sid} · ${e.desig || '—'}`,
        hm(legacy.otMin), `${legacy.pct.toFixed(1)}%`,
        hm(newR.otMin), `${newR.pct.toFixed(1)}%`,
        `${diffMin >= 0 ? '+' : '-'}${hm(Math.abs(diffMin))}`,
        `${diffPct >= 0 ? '+' : '-'}${Math.abs(diffPct).toFixed(1)}%`,
      ];
    }),
    styles: { ...BODY_STYLE, fontSize: 7 },
    headStyles: { ...HEAD_STYLE, fontSize: 6.5 },
    columnStyles: { 0: { cellWidth: 42 } },
    theme: 'grid',
    didParseCell: (data) => {
      if (data.section === 'body' && (data.column.index === 5 || data.column.index === 6)) {
        data.cell.styles.textColor = data.cell.raw.startsWith('+') ? [179, 38, 30] : [26, 127, 55];
      }
    },
  });
  y = doc.lastAutoTable.finalY + 6;

  doc.setFontSize(7).setTextColor(120, 120, 120).setFont(undefined, 'normal');
  doc.text(
    'Old-system figures are reconstructed from attendance card data using the pre-Aug-2026 rules (35h/week baseline, no weekly-line gating,\n'
    + '7h/day flat duty credit, Friday and off-day work fully paid, Annual/Sick/FRL leave credited 7h). They may not match a historical HR\n'
    + 'report exactly for staff who had manual OT adjustments on file — this is a comparison estimate, not a payroll reproduction.',
    margin, y
  );

  addFooters(doc, 'Comparison only — see note above on old-system figures');
  return doc.output('blob');
}

/* ================================================================
   5. TRANSITION PERIOD REPORT — for the one payroll period that straddles
   the rule change: days before `cutoverDate` measured under the old rules,
   days at/after it under the new rules, combined into one figure per person.
   `rows`: [{ e, preOtMin, postOtMin, otMin, amount, pct }] — see
   legacyCfg.js's transitionTotals().
   ================================================================ */
export function generateTransitionPeriodPdf(rows, cfg, from, to, cutoverDate, unitLabel) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = 12;
  let y = margin;
  const cutoverEve = dparse(cutoverDate);
  cutoverEve.setDate(cutoverEve.getDate() - 1);
  const eveLabel = cutoverEve.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  y = addHeader(
    doc, margin, y, 'Transition Period Report',
    `${unitLabel || 'All units'} · ${rows.length} staff · ${fmtDate(from)} – ${fmtDate(to)}`
  );
  doc.setFontSize(7.5).setTextColor(110, 110, 110).setFont(undefined, 'normal');
  doc.text(`${fmtDate(from)} – ${eveLabel} under the pre-Aug-2026 rules  ·  ${fmtDate(cutoverDate)} – ${fmtDate(to)} under the 48h rules`, margin, y);
  y += 6;

  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Staff', `Pre-${fmtDate(cutoverDate)} OT (old rules)`, `${fmtDate(cutoverDate)}+ OT (new rules)`, 'Combined OT', '% of basic', 'Amount']],
    body: rows.map(({ e, preOtMin, postOtMin, otMin, amount, pct }) => [
      `${e.name}\n${e.sid} · ${e.desig || '—'}`,
      hm(preOtMin), hm(postOtMin), hm(otMin), `${pct.toFixed(2)}%`, money(amount, cfg),
    ]),
    styles: BODY_STYLE,
    headStyles: HEAD_STYLE,
    columnStyles: { 0: { cellWidth: 48 } },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 6;

  doc.setFontSize(7).setTextColor(120, 120, 120).setFont(undefined, 'normal');
  doc.text(
    'The pre-cutover figure is reconstructed from attendance card data under the pre-Aug-2026 rules (see the Unit OT Comparison report\'s\n'
    + 'own note on that reconstruction\'s limits); the post-cutover figure is this person\'s ordinary 48h-rules total for those dates.',
    margin, y
  );

  addFooters(doc, 'Combined pre/post rule-change total for this period');
  return doc.output('blob');
}
