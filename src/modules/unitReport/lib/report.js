/**
 * Monthly unit-head report — the "Work Details for Unit Head Meeting" sheet.
 *
 * One record per month. Its three tables live inside the record's data as
 * arrays of rows, because the report is always opened, edited and exported
 * whole; rows never stand on their own.
 *
 *   data = { month: 'YYYY-MM', department, unit, head, staff,
 *            tasks: [row], routine: [row], planned: [row] }
 *   row  = { id, details, start, end, pct, remarks }   dates are 'YYYY-MM-DD'
 */

export const REPORT_TYPE = 'unitreport.month';

export const SECTIONS = [
  { key: 'tasks', label: 'Tasks / projects', fill: 'B4C6E7' },
  { key: 'routine', label: 'Routine tasks', fill: 'F4B084' },
  { key: 'planned', label: 'Planned for next month', fill: 'A9D08E' },
];

const pad = (n) => String(n).padStart(2, '0');

export const newId = () => Math.random().toString(36).slice(2, 10);

export const blankRow = (fields = {}) => ({
  id: newId(), details: '', start: '', end: '', pct: '', remarks: '', ...fields,
});

/** 'YYYY-MM' → Date of the 1st. */
const monthDate = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1);
};

export const monthName = (month) =>
  monthDate(month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export const addMonths = (month, n) => {
  const d = monthDate(month);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const thisMonth = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

/** '2026-09-02' → '02-09-2026', the sheet's date style. */
export const dmy = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
};

export const pctOf = (row) => {
  if (row.pct === '' || row.pct == null) return null;
  const n = Number(row.pct);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
};

export const sectionTitle = (key, month) => {
  if (key === 'tasks') return `Tasks/Projects carried out for the month of ${monthName(month)}`;
  if (key === 'routine') return 'Routine Tasks';
  return `Tasks/Projects planned for the month of ${monthName(addMonths(month, 1))}`;
};

export const headerLines = (d) => [
  `Unit Name: ${d.unit || ''}`,
  `Unit Head (Name / Designation): ${d.head || ''}`,
  `No. of Staff: ${d.staff ?? ''}`,
];

export const reportTitle = (month) => `Work Details for Unit Head Meeting (${monthName(month)})`;

/** "9. Male Power Generation - Electrical Services - Unit Head Report for the month of September 2026" */
export function fileBase(d) {
  const m = Number(d.month.split('-')[1]);
  const dept = (d.department || '').replace(/\s+department$/i, '').trim();
  const parts = [dept, d.unit].filter(Boolean).join(' - ');
  const name = `${m}. ${parts ? `${parts} - ` : ''}Unit Head Report for the month of ${monthName(d.month)}`;
  return name.replace(/[\\/:*?"<>|]/g, '-');
}

/**
 * The table body both exports draw: a coloured title row per section, then
 * its numbered rows. Empty dates in the first two sections print as "-" the
 * way the sheet does; planned rows stay blank.
 */
export function tableRows(d) {
  const out = [];
  for (const s of SECTIONS) {
    out.push({ kind: 'section', key: s.key, title: sectionTitle(s.key, d.month), fill: s.fill });
    (d[s.key] || []).forEach((r, i) => {
      const dash = s.key !== 'planned' && !r.start && !r.end && r.details ? '-' : '';
      out.push({
        kind: 'row', key: s.key, n: i + 1, details: r.details || '',
        start: r.start || '', end: r.end || '',
        startText: dmy(r.start) || dash, endText: dmy(r.end) || dash,
        pct: s.key === 'planned' ? null : pctOf(r), remarks: r.remarks || '',
      });
    });
  }
  return out;
}

/** A row is done when it reached 100 %. */
const unfinished = (r) => (pctOf(r) ?? 0) < 100 && (r.details || '').trim();

/**
 * Start next month from this one: same header; last month's plans and
 * anything not finished become this month's tasks; routine tasks come back
 * with their dates cleared.
 */
export function nextMonthData(prev, month, opts = { carry: true, plans: true, routine: true }) {
  const d = prev?.data || {};
  const tasks = [];
  if (opts.plans) (d.planned || []).filter((r) => (r.details || '').trim())
    .forEach((r) => tasks.push(blankRow({ details: r.details, remarks: r.remarks || '' })));
  if (opts.carry) (d.tasks || []).filter(unfinished)
    .forEach((r) => {
      if (tasks.some((t) => t.details.trim().toLowerCase() === r.details.trim().toLowerCase())) return;
      tasks.push(blankRow({ details: r.details, start: r.start, pct: r.pct, remarks: r.remarks || '' }));
    });
  return {
    month,
    department: d.department || '',
    unit: d.unit || '',
    head: d.head || '',
    staff: d.staff ?? '',
    tasks,
    routine: opts.routine ? (d.routine || []).map((r) => blankRow({ details: r.details })) : [],
    planned: [],
  };
}

/** Sort a section by start date; undated rows keep their order at the end. */
export const byStart = (rows) => rows
  .map((r, i) => [r, i])
  .sort(([a, i], [b, j]) => (a.start ? 0 : 1) - (b.start ? 0 : 1)
    || (a.start || '').localeCompare(b.start || '') || i - j)
  .map(([r]) => r);

/** Pasted lines → rows (one per line, numbering like "12." or "12)" dropped). */
export const rowsFromText = (text) => text.split(/\r?\n/)
  .map((l) => l.replace(/^\s*\d+\s*[.)-]?\s+/, '').trim())
  .filter(Boolean)
  .map((details) => blankRow({ details }));
