import { useEffect, useState } from 'react';
import { Sheet, Row } from '../../../core/ui/components';
import { PdfPreviewScreen } from '../../../core/ui/PdfPreview';
import { FileBarChart2, FileSpreadsheet, GitCompareArrows, Split } from 'lucide-react';
import { runRange } from '../lib/overtimeEngine';
import { LEGACY_CFG, legacyTotals, transitionTotals, eraRange } from '../lib/legacyCfg';

const loadPdfGen = () => import('../lib/pdfGen');

const REPORTS = [
  {
    id: 'overview', title: 'Staff Overview', icon: FileBarChart2,
    desc: 'Actual-to-date and projected figures for every staff member — the Staff tab, as a PDF.',
  },
  {
    id: 'unit', title: 'Unit Overtime Report', icon: FileSpreadsheet,
    desc: 'Closed-period, approved-basis totals for every staff member — for submission at period end.',
  },
  {
    id: 'comparison', title: 'Unit OT Comparison', icon: GitCompareArrows,
    desc: 'Old (pre-Aug-2026, 35h) vs new (48h) rules, reconstructed from attendance data, for the same period.',
  },
  {
    id: 'transition', title: 'Transition Period Report', icon: Split,
    desc: 'For a period straddling the rule change — old rules before the cutover, new rules after, combined into one total.',
  },
];

/**
 * Picker for the three unit-wide reports (the fourth — individual staff — is
 * reached from OvertimeReport.jsx itself, once a specific person is
 * filtered there). Each choice generates its own PDF blob on the spot and
 * hands off to the shared PdfPreviewScreen.
 */
export function ReportsSheet({ activeEmployees, rows, ctx, cfg, range, asOf, unitLabel, onClose }) {
  const [active, setActive] = useState(null);
  const [blob, setBlob] = useState(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setBlob(null);
    (async () => {
      const gen = await loadPdfGen();
      if (cancelled) return;
      let b;
      if (active === 'overview') {
        b = gen.generateStaffOverviewPdf(rows, cfg, asOf, range.to, unitLabel);
      } else if (active === 'unit') {
        // The real submission figure — has to agree with what the Overtime
        // tab shows for the same range, so it reads each date under
        // whichever rules actually applied to it, same as everywhere else.
        const unitRows = activeEmployees.map((e) => ({
          e,
          all: eraRange(e, range.from, range.to, ctx, {}),
          approved: eraRange(e, range.from, range.to, ctx, { approved: true }),
        }));
        b = gen.generateUnitOtPdf(unitRows, cfg, range.from, range.to, unitLabel);
      } else if (active === 'comparison') {
        // Deliberately NOT era-aware: this report's whole point is showing
        // what the old rules alone vs the new rules alone would each have
        // produced for the same dates, as a comparison — not the blended
        // reality eraRange measures.
        const legacyCtx = { ...ctx, cfg: LEGACY_CFG };
        const newRows = activeEmployees.map((e) => ({ e, result: runRange(e, range.from, range.to, ctx, {}) }));
        const legacyRows = activeEmployees.map((e) => ({ e, ...legacyTotals(e, range.from, range.to, legacyCtx, cfg) }));
        b = gen.generateOtComparisonPdf(newRows, legacyRows, cfg, range.from, range.to, unitLabel);
      } else if (active === 'transition') {
        const transitionRows = activeEmployees.map((e) => ({
          e, ...transitionTotals(e, range.from, range.to, ctx, cfg.legacyCutoverDate),
        }));
        b = gen.generateTransitionPeriodPdf(transitionRows, cfg, range.from, range.to, cfg.legacyCutoverDate, unitLabel);
      }
      if (!cancelled) setBlob(b);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (active) {
    const report = REPORTS.find((r) => r.id === active);
    const date = new Date().toISOString().slice(0, 10);
    return (
      <PdfPreviewScreen
        title={report.title} blob={blob} onClose={() => setActive(null)}
        fileName={`${report.title.replace(/\s+/g, '_')}_${date}.pdf`}
      />
    );
  }

  return (
    <Sheet open onClose={onClose} title="Reports">
      <div className="ruled">
        {REPORTS.map((r) => (
          <Row
            key={r.id} accent="var(--accent-overtime)"
            lead={<r.icon size={18} />}
            title={r.title} meta={r.desc}
            onClick={() => setActive(r.id)}
          />
        ))}
      </div>
    </Sheet>
  );
}
