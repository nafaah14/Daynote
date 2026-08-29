import { csvGrid } from './attendanceImport';

const durMin = (s) => { const m = /(\d+)\s*hrs?\s*(\d+)\s*mins?/i.exec(s); return m ? (+m[1]) * 60 + (+m[2]) : 0; };

/**
 * Parses the HRMS unit-wide Monthly Overtime Report. Unlike the prototype,
 * this never recovers basic salary from amount÷percentage (`solveBasic`) —
 * Roster is the source of truth for salary now. What's still valuable here
 * is the `reported` HRMS figures, kept for the reconciliation panel that
 * verified this port against the client's real output (HANDOVER.md §6).
 */
export function parseUnitReport(text) {
  const rowsOut = csvGrid(text);
  if (!rowsOut.length) return [];
  const head = rowsOut[0].map((h) => h.trim());
  const ix = (n) => head.findIndex((h) => h.toLowerCase() === n.toLowerCase());
  const c = {
    no: ix('Employee Number'), name: ix('Name'),
    wk: ix('Worked Hours'), ex: ix('Extra Hours'), ot: ix('Total OT Minutes'), amt: ix('Total Amount'),
    pub: ix('Public Approved OT Minutes'), gen: ix('General Approved OT Minutes'), pct: ix('All OT Percentage'),
  };
  if (c.no < 0 || c.name < 0) throw new Error('Not a unit overtime report — "Name" and "Employee Number" columns are required.');
  const num = (s) => parseFloat(String(s || '0').replace(/,/g, '')) || 0;
  return rowsOut.slice(1).filter((r) => r.length > 3 && r[c.name]).map((r) => ({
    no: String(r[c.no]).trim(), name: r[c.name].trim(),
    workedMin: durMin(r[c.wk] || ''), extraMin: durMin(r[c.ex] || ''),
    otMin: durMin(r[c.ot] || ''), amount: num(r[c.amt]),
    pubMin: c.pub >= 0 ? durMin(r[c.pub] || '') : 0, genMin: c.gen >= 0 ? durMin(r[c.gen] || '') : 0,
    pct: c.pct >= 0 ? num(r[c.pct]) : 0,
  }));
}
