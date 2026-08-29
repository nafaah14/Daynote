/**
 * Attendance importer — ported from the overtime-console prototype. This is
 * the messiest, most load-bearing part of the port (see HANDOVER.md §5): it
 * ignores row boundaries entirely, flattens every punch in the month onto
 * one absolute timeline, dedupes, pairs IN→OUT sequentially, then files each
 * session under the roster day whose scheduled start is nearest.
 */

import { addD, daysBetween, tmin } from './overtimeEngine';

const MONIX = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/** Status mapping: Present -> work, Off Duty -> off, Absent -> absent,
 *  Annual Leave -> annual, Sick Leave -> sick, Family Responsibility -> frl. */
const ATT_WORDS = [
  [/^present$/i, 'work'], [/off\s*duty/i, 'off'], [/^absent$/i, 'absent'],
  [/annual/i, 'annual'], [/sick/i, 'sick'], [/family|responsib|frl/i, 'frl'],
  [/holiday/i, 'off'], [/leave/i, 'casual'],
];
export const attStatus = (s) => { const t = String(s || '').trim(); for (const [re, v] of ATT_WORDS) if (re.test(t)) return v; return 'off'; };

/** The compact form used by the prototype's seeded sample data:
 *  employeeNumber;MMDD;status;HHMMSS-HHMMSS;punches — kept for fixtures/tests. */
const ATT_STATUS_COMPACT = { P: 'work', O: 'off', X: 'absent', A: 'annual', S: 'sick', F: 'frl' };

export function csvGrid(text) {
  const out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

export function attDate(s) {
  const t = String(s || '').trim();
  let m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(t);
  if (m) { const mo = MONIX[m[2][0].toUpperCase() + m[2].slice(1, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`; }
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return m[0];
  m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(t); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

export function attPunches(s) {
  const out = []; const re = /Check\s*(In|Out)\s*:?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/gi; let m;
  while ((m = re.exec(String(s || '')))) out.push({ t: /in/i.test(m[1]) ? 'I' : 'O', sec: (+m[2]) * 3600 + (+m[3]) * 60 + (+(m[4] || 0)) });
  return out;
}

/** Parses the real HRMS attendance export: Employee Number, Name,
 *  Designation, Department, Date, Day, Schedule, Attendance, Status. */
export function parseAttendance(text) {
  const g = csvGrid(text);
  if (!g.length) throw new Error('Empty file.');
  const head = g[0].map((h) => h.trim());
  const ix = (n) => head.findIndex((h) => h.toLowerCase() === n.toLowerCase());
  const c = { no: ix('Employee Number'), name: ix('Name'), des: ix('Designation'), dep: ix('Department'), un: ix('Unit'), date: ix('Date'), sch: ix('Schedule'), att: ix('Attendance'), st: ix('Status') };
  if (c.no < 0 || c.date < 0 || c.att < 0) throw new Error('Not an attendance report — it needs Employee Number, Date and Attendance columns.');
  const emps = {};
  g.slice(1).forEach((r) => {
    if (r.length < 4 || !r[c.no]) return;
    const no = String(r[c.no]).replace(/"/g, '').trim();
    const e = emps[no] = emps[no] || {
      no, name: (r[c.name] || '').replace(/"/g, '').trim(),
      desig: c.des >= 0 ? r[c.des].replace(/"/g, '').trim() : '',
      dept: c.dep >= 0 ? r[c.dep].replace(/"/g, '').trim() : '',
      unit: c.un >= 0 ? r[c.un].replace(/"/g, '').trim() : '', days: {},
    };
    const d = attDate(r[c.date]); if (!d) return;
    const sm = /(\d{1,2}):(\d{2})(?::\d{2})?\s*-\s*(\d{1,2}):(\d{2})/.exec(String(r[c.sch] || ''));
    e.days[d] = {
      status: attStatus(c.st >= 0 ? r[c.st] : 'Present'),
      schedS: sm ? `${sm[1].padStart(2, '0')}:${sm[2]}` : null,
      schedE: sm ? `${sm[3].padStart(2, '0')}:${sm[4]}` : null,
      punches: attPunches(r[c.att]),
    };
  });
  return Object.values(emps);
}

/** Compact fixture format — see ATT_STATUS_COMPACT above. Not a production
 *  import path; used to replay the prototype's verified seed data in tests. */
export function parseCompactAttendance(txt, year) {
  const emps = {};
  txt.trim().split('\n').forEach((line) => {
    const [no, md, st, sch, pun] = line.split(';');
    const e = emps[no] = emps[no] || { no, name: '', desig: '', dept: '', unit: '', days: {} };
    const d = `${year}-${md.slice(0, 2)}-${md.slice(2, 4)}`;
    const sm = /^(\d{2})(\d{2})\d{2}-(\d{2})(\d{2})\d{2}$/.exec(sch || '');
    e.days[d] = {
      status: ATT_STATUS_COMPACT[st] || 'off',
      schedS: sm ? `${sm[1]}:${sm[2]}` : null, schedE: sm ? `${sm[3]}:${sm[4]}` : null,
      punches: (pun || '').split(',').filter(Boolean).map((p) => ({ t: p[0], sec: (+p.slice(1, 3)) * 3600 + (+p.slice(3, 5)) * 60 + (+p.slice(5, 7)) })),
    };
  });
  return Object.values(emps);
}

/** Pairs punches into sessions across the whole month, then files each
 *  session under the roster day whose shift it belongs to — a 16:00 shift
 *  ends after midnight, and a 00:00 shift is often carded into the evening
 *  before. Sessions come out as `{ i, o, open }` in seconds relative to
 *  midnight of the work date they're filed under (i/o may be negative or
 *  exceed 86400) — this is what makes overnight shifts arithmetic instead
 *  of special-cased. */
export function buildSessions(att) {
  const dates = Object.keys(att.days).sort();
  if (!dates.length) return {};
  const base = dates[0], abs = (d) => daysBetween(base, d) * 86400;
  const P = [];
  dates.forEach((d) => att.days[d].punches.forEach((p) => P.push({ at: abs(d) + p.sec, t: p.t })));
  P.sort((a, b) => a.at - b.at);
  // a card read twice in the same minute is one event: keep the first in, the last out
  const Q = [];
  P.forEach((p) => {
    const l = Q[Q.length - 1];
    if (l && l.t === p.t && p.at - l.at <= 1200) { if (p.t === 'O') Q[Q.length - 1] = p; return; }
    Q.push(p);
  });
  const sessions = [];
  for (let i = 0; i < Q.length; i++) {
    if (Q[i].t !== 'I') continue;
    if (i + 1 < Q.length && Q[i + 1].t === 'O') { sessions.push({ a: Q[i].at, b: Q[i + 1].at, open: false }); i++; } else sessions.push({ a: Q[i].at, b: null, open: true });
  }
  const byDay = {};
  sessions.forEach((s) => {
    let best = null;
    dates.forEach((d) => {
      if (!att.days[d].schedS) return;
      const diff = Math.abs(s.a - (abs(d) + tmin(att.days[d].schedS) * 60));
      if (!best || diff < best.diff) best = { diff, d };
    });
    const wd = (best && best.diff <= 6 * 3600) ? best.d : addD(base, Math.floor(s.a / 86400));
    const o = abs(wd);
    (byDay[wd] = byDay[wd] || []).push({ i: s.a - o, o: s.b == null ? null : s.b - o, open: s.open });
  });
  return byDay;
}

/** Does this person run shifts? Several different rostered windows, or an
 *  eight-hour window matching a configured shift start, means yes. */
export function detectDuty(att, cfg) {
  const set = new Set();
  Object.values(att.days).forEach((v) => { if (v.schedS) set.add(`${v.schedS}-${v.schedE}`); });
  if (set.size > 1) return true;
  const one = [...set][0];
  if (!one) return false;
  const [a, b] = one.split('-');
  let len = tmin(b) - tmin(a); if (len <= 0) len += 1440;
  return len >= cfg.shiftMin && (cfg.shiftStarts || []).includes(a);
}

/**
 * Turns one employee's parsed attendance block into the day records the
 * engine consumes, keyed by date. Pure — no repo/state writes; the caller
 * (an import screen) matches `att.no` to a person and persists these.
 */
export function attendanceToDays(att, cfg, opts = {}) {
  const sess = buildSessions(att);
  const days = {};
  Object.keys(att.days).forEach((d) => {
    const v = att.days[d];
    days[d] = {
      status: v.status, schedS: v.schedS, schedE: v.schedE,
      sessions: sess[d] || [], appr: (opts.keepApprovals && opts.priorAppr && opts.priorAppr[d]) || {},
      src: 'attendance',
    };
  });
  return { no: att.no, name: att.name, desig: att.desig, dept: att.dept, unit: att.unit, staffType: detectDuty(att, cfg) ? 'duty' : 'maintenance', days };
}
