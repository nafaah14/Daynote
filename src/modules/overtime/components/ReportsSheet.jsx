import { useEffect, useState } from 'react';
import { Sheet, Row } from '../../../core/ui/components';
import { PdfPreviewScreen } from '../../../core/ui/PdfPreview';
import { FileBarChart2, FileSpreadsheet, GitCompareArrows } from 'lucide-react';
import { runRange } from '../lib/overtimeEngine';
import { LEGACY_CFG, legacyTotals } from '../lib/legacyCfg';

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
        const unitRows = activeEmployees.map((e) => ({
          e,
          all: runRange(e, range.from, range.to, ctx, {}),
          approved: runRange(e, range.from, range.to, ctx, { approved: true }),
        }));
        b = gen.generateUnitOtPdf(unitRows, cfg, range.from, range.to, unitLabel);
      } else if (active === 'comparison') {
        const legacyCtx = { ...ctx, cfg: LEGACY_CFG };
        const newRows = activeEmployees.map((e) => ({ e, result: runRange(e, range.from, range.to, ctx, {}) }));
        const legacyRows = activeEmployees.map((e) => ({ e, ...legacyTotals(e, range.from, range.to, legacyCtx, cfg) }));
        b = gen.generateOtComparisonPdf(newRows, legacyRows, cfg, range.from, range.to, unitLabel);
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
