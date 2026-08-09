/**
 * CSV import for the staff directory.
 *
 * One real quirk in the STELCO export this has to survive: some unit names
 * contain unescaped commas —
 *     ...,Procurement Department,Tendering, Sourcing and Contract Management Unit,4672
 * That row has more fields than the header. Rather than dropping it or
 * shifting every column right, we merge the overflow back into the unit
 * column, which is where the stray commas actually come from.
 */

function splitLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map((l) => splitLine(l));
  return { headers, rows };
}

/**
 * Guess which column is which. The export's header row is unreliable — column
 * two is labelled "Designation" but holds the name — so we score by content,
 * not by the header text, and let the user override in the UI.
 */
/* Words that appear in job titles and essentially never in a person's name.
   This is the signal that actually separates the name column from the
   designation column — cardinality can't, because on any small sample both
   look equally distinct. */
const ROLE_WORDS = /\b(officer|manager|engineer|technician|supervisor|assistant|senior|deputy|chief|operator|driver|labour|labor|intern|crew|welder|architect|auditor|secretary|consultant|surveyor|mechanic|guard|captain|station|administrative|service|support|accounts|legal|project|maintenance|general|company|risk|application|development)\b/i;

/* Words that mark an org-unit column rather than a person or a title. */
const ORG_WORDS = /\b(department|unit|centre|center|bureau|powerhouse|division|section|audit)\b/i;

/**
 * Guess which column is which.
 *
 * The header row in these exports is unreliable — column two is labelled
 * "Designation" but holds the name — so everything here scores the *content*
 * and the user can override any of it in the UI before importing.
 */
export function guessMapping(headers, rows) {
  const sample = rows.slice(0, 60);
  const col = (i) => sample.map((r) => (r[i] ?? '').trim());
  const n = headers.length;

  const nonEmpty = (v) => v.filter(Boolean);
  const ratio = (v, test) => {
    const ne = nonEmpty(v);
    return ne.length ? ne.filter(test).length / ne.length : 0;
  };
  const numericRatio = (v) => ratio(v, (x) => /^\d+$/.test(x));
  const roleRatio = (v) => ratio(v, (x) => ROLE_WORDS.test(x));
  const orgRatio = (v) => ratio(v, (x) => ORG_WORDS.test(x));
  const distinct = (v) => new Set(nonEmpty(v)).size;
  const avgLen = (v) => {
    const ne = nonEmpty(v);
    return ne.length ? ne.reduce((s, x) => s + x.length, 0) / ne.length : 0;
  };
  /** 1,2,3,… — a row counter, never the staff ID */
  const isSequential = (v) => {
    const nums = v.map(Number);
    if (nums.some(Number.isNaN)) return false;
    return nums.every((x, i) => i === 0 || x === nums[i - 1] + 1);
  };

  const stats = Array.from({ length: n }, (_, i) => {
    const v = col(i);
    return {
      i, v,
      numeric: numericRatio(v),
      role: roleRatio(v),
      org: orgRatio(v),
      distinct: distinct(v),
      len: avgLen(v),
      seq: isSequential(v),
      header: (headers[i] || '').toLowerCase(),
    };
  });

  const map = { name: -1, sid: -1, designation: -1, dept: -1, unit: -1, ext: -1, mobile: -1 };
  const taken = () => Object.values(map).filter((x) => x >= 0);
  const free = () => stats.filter((s) => !taken().includes(s.i));

  // mobile / ext: header is trustworthy for these
  stats.forEach((s) => {
    if (/mobile|phone|cell|contact/.test(s.header) && map.mobile === -1) map.mobile = s.i;
    else if (/\bext\b|extension/.test(s.header) && map.ext === -1) map.ext = s.i;
  });

  // designation: highest role-word density, low org-word density
  const desig = free()
    .filter((s) => s.numeric < 0.5 && s.role > 0.4 && s.org < s.role)
    .sort((a, b) => b.role - a.role)[0];
  if (desig) map.designation = desig.i;

  // org columns: high org-word density. The longer one is the department,
  // the other the unit — departments carry the longer formal names.
  const orgs = free().filter((s) => s.org > 0.5).sort((a, b) => b.len - a.len);
  if (orgs.length >= 2) { map.dept = orgs[0].i; map.unit = orgs[1].i; }
  else if (orgs.length === 1) {
    if (/unit|section/.test(orgs[0].header)) map.unit = orgs[0].i;
    else map.dept = orgs[0].i;
  }

  // staff id: numeric, mostly distinct, and NOT the sequential row counter
  const sid = free()
    .filter((s) => s.numeric > 0.8 && !s.seq && s.distinct > nonEmpty(s.v).length * 0.7)
    .sort((a, b) => b.len - a.len)[0];
  if (sid) map.sid = sid.i;

  // extension: what's left that is numeric and short
  if (map.ext === -1) {
    const ext = free().filter((s) => s.numeric > 0.6 && s.len <= 5 && !s.seq)[0];
    if (ext) map.ext = ext.i;
  }

  // name: text, almost no role words, highly distinct
  const name = free()
    .filter((s) => s.numeric < 0.3 && s.role < 0.25 && s.org < 0.25)
    .sort((a, b) => (b.distinct * b.len) - (a.distinct * a.len))[0];
  if (name) map.name = name.i;

  return map;
}

/** Turn raw rows into person payloads using the mapping. */
export function toPeople(rows, map, headerCount) {
  const pick = (row, i) => (i >= 0 ? (row[i] ?? '').trim() : '');

  return rows.map((rawRow) => {
    let row = rawRow;
    // fix the unescaped-comma rows by folding overflow into the unit column
    if (headerCount && row.length > headerCount && map.unit >= 0) {
      const extra = row.length - headerCount;
      const merged = row.slice(map.unit, map.unit + extra + 1).join(', ');
      row = [...row.slice(0, map.unit), merged, ...row.slice(map.unit + extra + 1)];
    }
    return {
      name: pick(row, map.name),
      sid: pick(row, map.sid),
      designation: pick(row, map.designation),
      dept: pick(row, map.dept),
      unit: pick(row, map.unit),
      ext: pick(row, map.ext),
      mobile: pick(row, map.mobile),
    };
  }).filter((p) => p.name || p.sid);
}

export const FIELD_LABELS = {
  name: 'Name',
  sid: 'Staff ID',
  designation: 'Designation',
  dept: 'Department',
  unit: 'Unit',
  ext: 'Extension',
  mobile: 'Mobile',
};
