/**
 * A note's HTML → a flat list of blocks that both exporters (PDF, Word) lay
 * out. Runs on the browser's DOM, after sanitize(), so it only ever sees the
 * tags the editor keeps.
 *
 * Block shapes:
 *   { type: 'p', runs, quote? }            a line (runs [] = an empty line)
 *   { type: 'h', level: 2 | 3, runs }
 *   { type: 'li', ordered, depth, runs, start? }  start = first item of a list
 *   { type: 'table', rows: [[{ runs, head }]] }
 *   { type: 'pre', text }
 *   { type: 'hr' }
 * A run is { text, b, i, u, code, color: 'RRGGBB' | null, size: 1 = normal }
 * or { br: true } inside a list item / table cell.
 */

const SIZES = { 'xx-small': 0.65, 'x-small': 0.75, small: 0.87, medium: 1, large: 1.2, 'x-large': 1.45, 'xx-large': 1.75 };

const sizeOf = (v) => {
  if (!v) return null;
  if (SIZES[v] != null) return SIZES[v];
  const px = /^([\d.]+)px$/.exec(v);
  if (px) return Number(px[1]) / 15.5;
  const em = /^([\d.]+)(em|rem)$/.exec(v);
  return em ? Number(em[1]) : null;
};

export const colorOf = (v) => {
  if (!v) return null;
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (h) return (h[1].length === 3 ? h[1].replace(/./g, '$&$&') : h[1]).toUpperCase();
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v.trim());
  return rgb ? rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
};

const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'CODE']);

function styleFor(el, s) {
  const t = el.tagName;
  const next = { ...s };
  if (t === 'B' || t === 'STRONG') next.b = true;
  if (t === 'I' || t === 'EM') next.i = true;
  if (t === 'U') next.u = true;
  if (t === 'CODE') next.code = true;
  const st = el.style;
  if (st) {
    if (/bold|[6-9]00/.test(st.fontWeight || '')) next.b = true;
    if (st.fontStyle === 'italic') next.i = true;
    if (/underline/.test(st.textDecoration || st.textDecorationLine || '')) next.u = true;
    const c = colorOf(st.color);
    if (c) next.color = c;
    const z = sizeOf(st.fontSize);
    if (z) next.size = z;
  }
  return next;
}

const BASE = { b: false, i: false, u: false, code: false, color: null, size: 1 };

/** Inline content of an element → runs; block children become line breaks. */
function runsOf(el, s = BASE, out = []) {
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) { if (n.nodeValue) out.push({ ...s, text: n.nodeValue }); return; }
    if (n.nodeType !== 1) return;
    if (n.tagName === 'BR') { out.push({ br: true }); return; }
    if (INLINE.has(n.tagName)) { runsOf(n, styleFor(n, s), out); return; }
    // A <div> / <p> inside a cell or list item: its own line.
    if (out.length && !out[out.length - 1].br) out.push({ br: true });
    runsOf(n, styleFor(n, s), out);
  });
  return out;
}

/** Trim: collapse whitespace a browser would, drop trailing line breaks. */
function tidy(runs) {
  const r = runs.map((x) => (x.br ? x : { ...x, text: x.text.replace(/[\n\r\t ]+/g, ' ') }));
  while (r.length && r[r.length - 1].br) r.pop();
  while (r.length && r[0].br) r.shift();
  return r.filter((x) => x.br || x.text);
}

export function noteBlocks(html) {
  const host = document.createElement('div');
  host.innerHTML = html || '';
  const blocks = [];
  let runs = [];
  const line = (quote) => {
    const t = tidy(runs);
    blocks.push(quote ? { type: 'p', runs: t, quote: true } : { type: 'p', runs: t });
    runs = [];
  };
  const flush = (quote) => { if (runs.some((r) => r.text?.trim())) line(quote); else runs = []; };

  const list = (el, depth) => {
    const ordered = el.tagName === 'OL';
    let first = true;
    el.childNodes.forEach((li) => {
      if (li.nodeType !== 1) return;
      if (li.tagName === 'UL' || li.tagName === 'OL') { list(li, depth + 1); return; }
      const own = [];
      const nested = [];
      li.childNodes.forEach((n) => (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL') ? nested : own).push(n));
      const box = document.createElement('div');
      own.forEach((n) => box.appendChild(n.cloneNode(true)));
      blocks.push({ type: 'li', ordered, depth, runs: tidy(runsOf(box, styleFor(li, BASE))), ...(first ? { start: true } : {}) });
      first = false;
      nested.forEach((n) => list(n, depth + 1));
    });
  };

  const walk = (el, s, quote) => {
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) { if (n.nodeValue) runs.push({ ...s, text: n.nodeValue }); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (t === 'BR') { line(quote); return; }
      if (INLINE.has(t)) { runsOf(n, styleFor(n, s), runs); return; }
      flush(quote);
      if (t === 'H2' || t === 'H3') blocks.push({ type: 'h', level: t === 'H2' ? 2 : 3, runs: tidy(runsOf(n)) });
      else if (t === 'HR') blocks.push({ type: 'hr' });
      else if (t === 'PRE') blocks.push({ type: 'pre', text: n.textContent.replace(/\n$/, '') });
      else if (t === 'UL' || t === 'OL') list(n, 0);
      else if (t === 'TABLE') {
        const rows = [...n.querySelectorAll('tr')].map((tr) =>
          [...tr.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH')
            .map((c) => ({ runs: tidy(runsOf(c)), head: c.tagName === 'TH' })));
        if (rows.some((r) => r.length)) blocks.push({ type: 'table', rows });
      } else if (t === 'BLOCKQUOTE') { walk(n, s, true); flush(true); }
      else {
        // A line (<div> / <p>). "<div><br></div>" is an empty line: its <br>
        // writes it; a trailing <br> after text is just the line's end.
        walk(n, styleFor(n, s), quote);
        flush(quote);
      }
    });
  };
  walk(host, BASE, false);
  flush(false);
  while (blocks.length && blocks[blocks.length - 1].type === 'p' && !blocks[blocks.length - 1].runs.length) blocks.pop();
  return blocks;
}

/** Plain text of runs, for table cells in the PDF and file names. */
export const runsText = (runs) => runs.map((r) => (r.br ? '\n' : r.text)).join('');

export function fileName(title, ext) {
  const base = (title || 'Note').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Note';
  return `${base}.${ext}`;
}
