/**
 * Import from the SID 2.0 page itself, saved from the browser (Ctrl+S):
 * "Webpage, Single File" (.mhtml) or "Webpage, HTML only" (.html).
 *
 * The saved page carries the real table — one <tr> per person, one <td> per
 * column — so nothing is guessed from positions the way the PDF reader has
 * to (where wrapped departments like "Hulhumale' Power / Generation
 * Department" broke). Columns are found by their header text, so a reordered
 * table still reads right.
 *
 * Gives the same rows as extractSidPdf, for buildPlan:
 *   { sid, name, designation, dept, unit, ext, isUnitHead }
 * Mobile is never read: the page masks it when you're not signed in, and
 * hand-collected mobiles must never be overwritten anyway.
 */

/** The HTML inside an .mhtml file, or the text itself if it's already HTML. */
export function htmlFromSaved(text) {
  const head = text.slice(0, 4000);
  const m = /boundary="?([^"\r\n;]+)"?/i.exec(head);
  if (!/multipart\/related/i.test(head) || !m) return text;

  const parts = text.split(`--${m[1]}`);
  for (const part of parts) {
    const split = part.search(/\r?\n\r?\n/);
    if (split < 0) continue;
    const headers = part.slice(0, split);
    if (!/content-type:\s*text\/html/i.test(headers)) continue;
    const body = part.slice(split).replace(/^\r?\n\r?\n/, '');
    const enc = (/content-transfer-encoding:\s*([\w-]+)/i.exec(headers)?.[1] || '').toLowerCase();
    if (enc === 'quoted-printable') return utf8(qpBytes(body));
    if (enc === 'base64') return utf8(Uint8Array.from(atob(body.replace(/\s+/g, '')), (c) => c.charCodeAt(0)));
    return body;
  }
  throw new Error('No web page was found inside this file.');
}

function qpBytes(s) {
  const t = s.replace(/=\r?\n/g, ''); // soft line breaks
  const out = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) {
      out.push(parseInt(t.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(t.charCodeAt(i) & 0xff);
    }
  }
  return new Uint8Array(out);
}

const utf8 = (bytes) => new TextDecoder('utf-8').decode(bytes);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

const cellText = (html) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const COLUMNS = { Name: 'name', StaffID: 'sid', Job: 'designation', Dept: 'dept', Unit: 'unit', EXTNo: 'ext' };

/**
 * @param {string} html the saved page (or an .mhtml file's text)
 * @returns {{ rows: Array<{sid,name,designation,dept,unit,ext,isUnitHead}> }}
 */
export function rowsFromSidPage(text) {
  const html = htmlFromSaved(text);
  const trs = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);

  // The header row names the columns.
  let index = null;
  let start = 0;
  for (; start < trs.length; start++) {
    const ths = [...trs[start].matchAll(/<th\b[^>]*>([\s\S]*?)(?=<th\b|$)/gi)].map((m) => cellText(m[1]));
    if (ths.includes('StaffID') && ths.includes('Name')) {
      index = {};
      ths.forEach((label, i) => { if (COLUMNS[label]) index[COLUMNS[label]] = i; });
      break;
    }
  }
  if (!index) {
    throw new Error(
      "This doesn't look like the SID 2.0 staff page — the column headers (Name, StaffID, Job, Dept, Unit…) weren't found."
    );
  }

  const rows = [];
  const bySid = new Map();
  for (const tr of trs.slice(start + 1)) {
    const tds = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length <= index.sid) continue;

    const nameCell = tds[index.name] || '';
    const isUnitHead = /class="[^"]*\bavatar-wrap\b[^"]*\bresp-unit\b/.test(nameCell);
    const name = cellText(nameCell.replace(/<span\b[^>]*class="avatar"[^>]*>[\s\S]*?<\/span>/gi, ''));
    const get = (k) => (index[k] === undefined ? '' : cellText(tds[index[k]] || ''));

    const sid = get('sid');
    if (!/^\d+$/.test(sid)) continue;
    const ext = get('ext');
    const row = {
      sid, name, designation: get('designation'), dept: get('dept'), unit: get('unit'),
      ext: ext === '0' ? '' : ext, isUnitHead,
    };
    if (bySid.has(sid)) rows[bySid.get(sid)] = row;
    else { bySid.set(sid, rows.length); rows.push(row); }
  }
  return { rows };
}

/** Read a picked file: .mhtml / .mht / .html. */
export async function extractSidPage(file) {
  return rowsFromSidPage(await file.text());
}
