import { useState, useMemo } from 'react';
import { ArrowLeft, Download, Crown } from 'lucide-react';
import { useBackClose, Toggle } from '../../core/ui/components';

/**
 * Same "preview screen you can Print / Save PDF from" pattern Payments uses
 * for statements (see payments.jsx → ReportPreview): a full-screen overlay,
 * a body class toggled only for the moment of printing so the print output
 * never includes anything from underneath it, and column widths fixed via
 * <colgroup> so the browser's print layout doesn't reflow them.
 */

// Department/Company share one column — a personal contact never has a
// department (see core/people.js), so the two values never collide.
const COLUMNS = [
  { key: 'name', label: 'Name', width: '20%' },
  { key: 'sid', label: 'Staff ID', width: '9%' },
  { key: 'designation', label: 'Designation', width: '17%' },
  { key: 'dept', label: 'Department / Company', width: '19%' },
  { key: 'unit', label: 'Unit', width: '16%' },
  { key: 'ext', label: 'Ext', width: '7%' },
  { key: 'mobile', label: 'Mobile', width: '12%' },
];

export function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(people) {
  const headers = [...COLUMNS.map((c) => c.label), 'Unit head'];
  const lines = [headers.map(csvEscape).join(',')];
  people.forEach((p) => {
    const d = p.data;
    const row = [
      p.title, d.sid, d.designation, d.personal ? d.company : d.dept, d.unit, d.ext, d.mobile,
      d.isUnitHead ? 'Yes' : '',
    ];
    lines.push(row.map(csvEscape).join(','));
  });
  return lines.join('\r\n');
}

export function criteriaText(filters, filterLabel, searchTerm) {
  const parts = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => filterLabel(k, v));
  if (searchTerm?.trim()) parts.push(`search "${searchTerm.trim()}"`);
  return parts.length ? parts.join(' · ') : 'All staff';
}

export function ExportPreview({ people: allFiltered, filters, filterLabel, searchTerm, onClose }) {
  useBackClose(onClose);

  // Personal contacts are excluded by default — this is meant to read as
  // the org's staff list — unless the screen's own filter already narrowed
  // to personal-only, in which case excluding them would just print nothing.
  const [includePersonal, setIncludePersonal] = useState(filters?.kind === 'personal');
  const personalCount = useMemo(() => allFiltered.filter((p) => p.data.personal).length, [allFiltered]);
  const people = useMemo(
    () => (includePersonal ? allFiltered : allFiltered.filter((p) => !p.data.personal)),
    [allFiltered, includePersonal]
  );

  const printedOn = new Date();
  const criteria = criteriaText(filters, filterLabel, searchTerm);
  const fileBase = `Directory — ${criteria === 'All staff' ? 'All staff' : criteria} — ${printedOn.toLocaleDateString('en-CA')}`;

  const handlePrint = () => {
    const prev = document.title;
    document.title = fileBase;
    document.body.classList.add('printing-report');
    const cleanup = () => {
      document.body.classList.remove('printing-report');
      document.title = prev;
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 1000); // safety net for browsers that skip afterprint
  };

  const handleCsv = () => {
    const blob = new Blob([buildCsv(people)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBase}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dir-export-scrim">
      <div className="dir-export-top no-print">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Back"><ArrowLeft size={19} /></button>
        <h2>Export preview</h2>
        <div className="dir-export-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={handleCsv}>
            <Download size={14} /> CSV
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handlePrint}>
            Print / Save PDF
          </button>
        </div>
      </div>

      {personalCount > 0 && (
        <label className="dir-export-personal-toggle no-print">
          <Toggle checked={includePersonal} onChange={setIncludePersonal} label="Include personal contacts" />
          Include {personalCount} personal contact{personalCount === 1 ? '' : 's'}
        </label>
      )}

      <div className="dir-export-scroll">
        <div className="dir-export-content">
          <div className="dir-report-head">
            <h1 className="dir-report-h1">{includePersonal ? 'Directory' : 'Staff Directory'}</h1>
            <p className="dir-report-generated">
              Generated {printedOn.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <p className="dir-report-criteria">
            <strong>{people.length}</strong> {people.length === 1 ? 'person' : 'people'} · {criteria}
          </p>

          <table className="dir-report-table">
            <colgroup>
              {COLUMNS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
            </colgroup>
            <thead>
              <tr>{COLUMNS.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.data.isUnitHead && <Crown size={11} className="dir-report-head-mark" aria-label="Unit head" />}
                    {p.title}
                  </td>
                  <td className="mono">{p.data.sid}</td>
                  <td>{p.data.designation}</td>
                  <td>{p.data.personal ? p.data.company : p.data.dept}</td>
                  <td>{p.data.unit}</td>
                  <td className="mono dir-report-num">{p.data.ext}</td>
                  <td className="mono dir-report-num">{p.data.mobile}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="dir-report-foot">
            <Crown size={10} style={{ verticalAlign: '-1px', marginRight: 3 }} /> marks the unit head.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ExportPreview;
