/**
 * Powerlog "Task Report" PDF → this month's report.
 *
 * Two halves, both pure so they're testable without a PDF:
 *   parsePowerlog(pages)  positioned text → tasks
 *   planImport(...)       tasks → a reviewable plan: routine rows filled from
 *                         matching work, everything else proposed as tasks
 *   applyImport(...)      the reviewed plan → new report data
 *
 * The export is a table: Task # | Type | Description | Start | End | Staff |
 * Status. A numbered line starts a task; "Worked on this day" lines under it
 * carry a date but no number and are skipped (the task's own Start/End
 * already span them); unnumbered, undated lines continue the task above,
 * including across a page break.
 */
import { blankRow, byStart, keyOf, missingChecks } from './report';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

/** '1 Oct 2026' → '2026-10-01' */
export function isoOf(text) {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec((text || '').trim());
  if (!m || !MONTHS[m[2].toLowerCase()]) return '';
  return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`;
}

const COLS = [['n', 'Task'], ['type', 'Type'], ['desc', 'Description'], ['start', 'Start'], ['end', 'End'], ['staff', 'Staff'], ['status', 'Status']];
// Dates sit centred under their headings, so their column starts a little left.
const NUDGE = { start: 14, end: 18 };

function lines(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const out = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - it.y) <= 3) last.items.push(it);
    else out.push({ y: it.y, items: [it] });
  }
  return out;
}

/**
 * @param pages [{ items: [{ x, y, str }] }]  y measured from the top of the page
 * @returns {{ period: string|null, tasks: Array }}
 */
export function parsePowerlog(pages) {
  let period = null;
  let bounds = null;
  const tasks = [];
  let cur = null;
  let inChild = false;

  for (const { items } of pages) {
    const clean = items.filter((i) => i.str && i.str.trim());
    const per = clean.find((i) => /^Period:/.test(i.str));
    if (per && !period) {
      const m = /Period:\s*([A-Za-z]+)\s+(\d{4})/.exec(per.str);
      const mm = m && MONTHS[m[1].slice(0, 3).toLowerCase()];
      if (mm) period = `${m[2]}-${pad(mm)}`;
    }
    const head = clean.find((i) => i.str.trim() === 'Description');
    if (!head) continue;
    const headRow = clean.filter((i) => Math.abs(i.y - head.y) <= 12);
    const found = COLS.map(([key, label]) => {
      const it = headRow.find((i) => i.str.trim() === label);
      return it ? [key, it.x - (NUDGE[key] || 0)] : null;
    });
    if (found.every(Boolean)) bounds = found.sort((a, b) => a[1] - b[1]);
    if (!bounds) continue;
    const top = Math.max(...headRow.map((i) => i.y)) + 4;

    const colOf = (x) => {
      let col = bounds[0][0];
      for (const [key, bx] of bounds) if (x + 2 >= bx) col = key;
      return col;
    };

    for (const line of lines(clean.filter((i) => i.y > top && !/^(Generated|Page \d+ of)/.test(i.str.trim())))) {
      const cell = {};
      for (const it of line.items) {
        const k = colOf(it.x);
        cell[k] = cell[k] ? `${cell[k]} ${it.str.trim()}` : it.str.trim();
      }
      if (cell.n && /^\d+$/.test(cell.n)) {
        cur = {
          n: Number(cell.n), type: cell.type || '', lines: cell.desc ? [cell.desc] : [],
          start: isoOf(cell.start), end: isoOf(cell.end), status: (cell.status || '').toUpperCase(),
        };
        tasks.push(cur);
        inChild = false;
      } else if (cell.start && isoOf(cell.start)) {
        inChild = true; // a "Worked on this day" entry
      } else if (cur && !inChild) {
        if (cell.desc) cur.lines.push(cell.desc);
        if (cell.type) cur.type = `${cur.type} ${cell.type}`;
      }
    }
  }

  return { period, tasks: tasks.map(finish) };
}

function finish(t) {
  const lines = [...t.lines];
  // Issues print their system ("DG6 / PLC/Control") as a last line of their own.
  if (/\[ISSUE\]/i.test(t.type) && lines.length > 1 && /^\S+ \/ \S/.test(lines[lines.length - 1])) lines.pop();
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  const [parent, sub] = text.includes('›') ? text.split('›').map((s) => s.trim()) : [null, null];
  // "Parent › Parent - step" → "step", also when only the start is shared
  // ("Control room renovation work - flooring installation › Control room
  // renovation work - Install cable tray…").
  let step = sub;
  if (parent && sub) {
    const pw = parent.split(' ');
    const sw = sub.split(' ');
    let i = 0;
    while (i < pw.length && i < sw.length && pw[i].toLowerCase() === sw[i].toLowerCase()) i++;
    if (i > 0) step = sw.slice(i).join(' ').replace(/^\s*[-–:]\s*/, '').trim();
  }
  return {
    n: t.n,
    type: t.type.replace(/\s+/g, ' ').trim(),
    routine: /^ROUTINE\b/i.test(t.type.trim()),
    details: parent ? sub : text,
    parent,
    step: step || null,
    start: t.start,
    end: t.end || t.start,
    status: t.status,
  };
}

/* ------------------------------- matching -------------------------------- */

const STOP = new Set(['and', 'the', 'of', 'to', 'for', 'in', 'with', 'a', 'an', 'on', 'at', 'from', 'all']);
const SYN = { swg: 'switchgear', gen: 'generator', alt: 'alternator', trafo: 'transformer' };

/** Words and equipment codes ("DG09" and "DG9" are the same engine). */
export function tokens(text) {
  const words = new Set();
  const codes = new Set();
  const norm = (text || '').toLowerCase().replace(/\b(dg|cg|sw|t)\s?0*(\d+)\b/g, '$1$2');
  for (let w of norm.split(/[^a-z0-9]+/)) {
    if (!w || STOP.has(w)) continue;
    if (/^(dg|cg|sw|t)\d+$/.test(w)) { codes.add(w); continue; }
    w = SYN[w] || w;
    if (w.length > 3 && w.endsWith('s')) w = w.slice(0, -1);
    words.add(w);
  }
  return { words, codes };
}

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

/** How much of `a` is found in `b`, 0..1 — 0 when they name different equipment. */
export function cover(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.codes.size && !sameSet(ta.codes, tb.codes)) return 0;
  if (!ta.words.size) return 0;
  let hit = 0;
  for (const w of ta.words) if (tb.words.has(w)) hit++;
  if (hit < Math.min(2, ta.words.size)) return 0;
  return hit / ta.words.size;
}

const ROUTINE_MATCH = 0.6;
const SAME_TASK = 0.75;

export { keyOf };

/**
 * Group Powerlog tasks into report rows: sub-tasks ("Parent › step") roll up
 * under their parent, the way a multi-week job is one line on the sheet.
 */
export function groupTasks(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    const key = keyOf(t.parent || t.details);
    if (!groups.has(key)) groups.set(key, { key, details: t.parent || t.details, members: [] });
    groups.get(key).members.push(t);
  }
  return [...groups.values()].map((g) => {
    const live = g.members.filter((m) => m.status !== 'CANCELLED');
    const use = live.length ? live : g.members;
    const starts = use.map((m) => m.start).filter(Boolean).sort();
    const ends = use.map((m) => m.end).filter(Boolean).sort();
    const steps = [...new Set(use.map((m) => m.step).filter(Boolean))];
    const done = live.length > 0 && live.every((m) => m.status === 'COMPLETED');
    return {
      key: g.key,
      details: g.details,
      start: starts[0] || '',
      end: ends[ends.length - 1] || '',
      status: !live.length ? 'CANCELLED' : done ? 'COMPLETED' : 'ONGOING',
      routine: g.members.every((m) => m.routine),
      steps,
      members: g.members,
    };
  });
}

/**
 * The review plan.
 *   items:   every Powerlog job (sub-tasks rolled up). `to` says where it goes:
 *            'tasks', 'routine' (a new routine row) or 'check:<name>' (counts
 *            as that routine check: fills its dates). Work that fits a check
 *            starts there; you can pick any other job for a check in review.
 *            A job already on the report as a task row updates that row.
 *   checks:  the routine checks to fill: this report's routine rows, plus the
 *            standard checks it dropped (`dropped`, added back only if given work)
 */
export function planImport(data, tasks, checks = []) {
  const groups = groupTasks(tasks);
  const onReport = (data.routine || []).map((r) => r.details).filter(Boolean);
  const dropped = missingChecks(checks, data.routine);
  const names = [...new Map([...onReport, ...dropped].map((n) => [keyOf(n), n])).values()];

  // Each piece of work goes to the routine check it fits best.
  const checkOf = new Map(); // group key → check name
  for (const g of groups) {
    if (g.status === 'CANCELLED') continue;
    let top = null;
    for (const n of names) {
      const s = cover(n, g.details);
      if (s >= ROUTINE_MATCH && (!top || s > top.s)) top = { n, s };
    }
    if (top) checkOf.set(g.key, top.n);
  }

  const taskRows = data.tasks || [];
  const items = groups.map((g) => {
    const row = taskRows.find((r) => r.plKey === g.key)
      || taskRows.find((r) => keyOf(r.details) === g.key)
      || taskRows.find((r) => cover(r.details, g.details) >= SAME_TASK && cover(g.details, r.details) >= SAME_TASK);
    return {
      key: g.key,
      include: g.status !== 'CANCELLED',
      to: checkOf.has(g.key) ? `check:${checkOf.get(g.key)}` : 'tasks',
      auto: checkOf.has(g.key),
      details: row ? row.details : g.details,
      source: g.details,
      start: g.start,
      end: g.end,
      pct: g.status === 'COMPLETED' ? '100' : '',
      remarks: g.steps.length > 1 ? g.steps.join('; ') : '',
      status: g.status,
      routineType: g.routine,
      count: g.members.length,
      matchRowId: row?.id || null,
      matchDetails: row?.details || null,
    };
  });

  return { items, checks: names, dropped };
}

const minDate = (a, b) => (!a ? b : !b ? a : a < b ? a : b);
const maxDate = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

export const checkTarget = (to) => (to && to.startsWith('check:') ? to.slice(6) : null);

export function applyImport(data, plan) {
  const next = { ...data, tasks: [...(data.tasks || [])], routine: [...(data.routine || [])] };

  // Work given to a routine check sets (or widens) that check's dates; a
  // dropped standard check comes back only when something was given to it.
  const fillCheck = (name, it) => {
    const at = next.routine.findIndex((row) => keyOf(row.details) === keyOf(name));
    if (at === -1) { next.routine.push(blankRow({ details: name, start: it.start, end: it.end })); return; }
    const row = next.routine[at];
    next.routine[at] = { ...row, start: minDate(row.start, it.start), end: maxDate(row.end, it.end) };
  };

  for (const it of plan.items) {
    if (!it.include) continue;
    const check = checkTarget(it.to);
    if (check) { fillCheck(check, it); continue; }
    const details = it.details.trim();
    if (!details) continue;
    if (it.matchRowId && it.to === 'tasks') {
      next.tasks = next.tasks.map((row) => (row.id !== it.matchRowId ? row : {
        ...row,
        details,
        plKey: it.key,
        start: minDate(row.start, it.start),
        end: maxDate(row.end, it.end),
        pct: it.pct !== '' ? it.pct : row.pct,
        remarks: row.remarks || it.remarks,
      }));
      continue;
    }
    next[it.to].push(blankRow({
      details, plKey: it.key, start: it.start, end: it.end,
      pct: it.to === 'tasks' ? it.pct : '', remarks: it.remarks,
    }));
  }

  next.tasks = byStart(next.tasks);
  return next;
}
