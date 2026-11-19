/**
 * Blocks → an A4 PDF laid out like the note: bold / italic / underline /
 * colour / size per run, headings, nested bullet and numbered lists, tables
 * (autotable), code and quotes. Loaded only when someone exports.
 */
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import { runsText } from './blocks';

applyPlugin(jsPDF);

const PT = 0.3528; // mm per point
const M = 18;
const BASE = 11;
const INK = [33, 37, 41];
const MUTED = [110, 116, 124];

/* The PDF's built-in fonts only know Latin-1; swap the usual others. */
const SWAP = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': ' - ', '…': '...', '•': '·', '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '≤': '<=', '≥': '>=', '≠': '!=', '✓': 'v', '✔': 'v', '✗': 'x', ' ': ' ', '™': '(TM)', '€': 'EUR', '−': '-', '×': 'x' };
export const latin = (s) => s.replace(/[^\u0000-ÿ]/gu, (c) => SWAP[c] ?? (/\p{Extended_Pictographic}|[️‍]/u.test(c) ? '' : '?'));

const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));

export function notePdf(title, blocks) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const W = pw - M * 2;
  let y = M;

  const ensure = (h) => { if (y + h > ph - M) { doc.addPage(); y = M; } };
  const setFont = (r, size) => {
    doc.setFont(r.code ? 'courier' : 'helvetica', r.b && r.i ? 'bolditalic' : r.b ? 'bold' : r.i ? 'italic' : 'normal');
    doc.setFontSize(size);
  };

  /** Lays runs out in lines across [x0, x0 + width]; returns the first line's baseline and page. */
  const flow = (runs, { x0 = M, width = W, size = BASE, color = INK, bold = false, gap = 1.42, bar = false } = {}) => {
    const lines = [[]];
    let cw = 0;
    const newLine = () => { lines.push([]); cw = 0; };
    for (const r of runs) {
      if (r.br) { newLine(); continue; }
      const sz = size * (r.size || 1);
      const style = { ...r, b: r.b || bold };
      for (const piece of latin(r.text).split(/(\s+)/)) {
        if (!piece) continue;
        const space = /^\s+$/.test(piece);
        if (space && cw === 0) continue;
        setFont(style, sz);
        let w = doc.getTextWidth(space ? ' ' : piece);
        if (!space && cw > 0 && cw + w > width) newLine();
        if (!space && w > width) {
          // A word longer than the line (a link): break it across lines.
          for (const part of doc.splitTextToSize(piece, width)) {
            setFont(style, sz);
            const pwid = doc.getTextWidth(part);
            if (cw > 0) newLine();
            lines[lines.length - 1].push({ text: part, r: style, sz, w: pwid });
            cw = pwid;
          }
          continue;
        }
        lines[lines.length - 1].push({ text: space ? ' ' : piece, r: style, sz, w });
        cw += w;
      }
    }
    let first = null;
    let firstPage = 0;
    for (const line of lines) {
      while (line.length && line[line.length - 1].text === ' ') line.pop();
      const top = Math.max(size, ...line.map((p) => p.sz));
      const h = top * PT * gap;
      ensure(h);
      const base = y + top * PT * 1.02;
      if (first == null) { first = base; firstPage = doc.getCurrentPageInfo().pageNumber; }
      if (bar) { doc.setDrawColor(200, 204, 210).setLineWidth(0.8).line(M + 1.2, y, M + 1.2, y + h); }
      let x = x0;
      for (const p of line) {
        setFont(p.r, p.sz);
        const c = p.r.color ? rgb(p.r.color) : color;
        doc.setTextColor(...c);
        if (p.r.code && p.text !== ' ') {
          doc.setFillColor(238, 238, 238).rect(x - 0.3, base - p.sz * PT * 0.8, p.w + 0.6, p.sz * PT * 1.05, 'F');
        }
        doc.text(p.text, x, base);
        if (p.r.u) doc.setDrawColor(...c).setLineWidth(0.2).line(x, base + 0.7, x + p.w, base + 0.7);
        x += p.w;
      }
      y += h;
    }
    return { base: first, page: firstPage };
  };

  if (title) {
    flow([{ text: title }], { size: 18, bold: true });
    y += 3;
  }

  const count = [];
  for (const b of blocks) {
    if (b.type === 'p') {
      if (!b.runs.length) { y += BASE * PT * 0.9; continue; }
      if (b.quote) flow(b.runs, { x0: M + 5, width: W - 5, color: MUTED, bar: true });
      else flow(b.runs);
      y += 0.8;
    } else if (b.type === 'h') {
      y += b.level === 2 ? 3.5 : 2.5;
      ensure(14);
      flow(b.runs, { size: b.level === 2 ? 15 : 12.5, bold: true });
      y += 1.2;
    } else if (b.type === 'li') {
      const indent = M + 6 + b.depth * 6;
      count.length = b.depth + 1;
      count[b.depth] = b.start || !count[b.depth] ? 1 : count[b.depth] + 1;
      const { base, page } = flow(b.runs.length ? b.runs : [{ text: ' ' }], { x0: indent, width: W - (indent - M) });
      // The marker goes on the item's first line, which may be on an earlier page.
      doc.setPage(page);
      doc.setTextColor(...INK).setFont('helvetica', 'normal').setFontSize(BASE);
      if (b.ordered) {
        const n = b.depth % 3 === 1 ? String.fromCharCode(96 + ((count[b.depth] - 1) % 26) + 1) : String(count[b.depth]);
        doc.text(`${n}.`, indent - 1.5, base, { align: 'right' });
      } else {
        doc.setFillColor(...INK).setDrawColor(...INK).setLineWidth(0.25);
        doc.circle(indent - 3.2, base - 1.25, 0.75, b.depth % 2 ? 'S' : 'F');
      }
      doc.setPage(doc.getNumberOfPages());
      y += 0.5;
    } else if (b.type === 'table') {
      const cell = (c) => ({ content: latin(runsText(c.runs)), styles: c.runs.length && c.runs.every((r) => r.br || r.b) ? { fontStyle: 'bold' } : {} });
      const head = b.rows[0].length && b.rows[0].every((c) => c.head) ? [b.rows[0].map(cell)] : [];
      const body = (head.length ? b.rows.slice(1) : b.rows).map((r) => r.map(cell));
      doc.autoTable({
        startY: y + 1,
        margin: { left: M, right: M, top: M, bottom: M },
        theme: 'grid',
        head,
        body,
        styles: { font: 'helvetica', fontSize: 9.5, textColor: INK, lineColor: [200, 204, 210], lineWidth: 0.2, cellPadding: 1.8, overflow: 'linebreak' },
        headStyles: { fillColor: [242, 243, 245], textColor: INK, fontStyle: 'bold' },
      });
      y = doc.lastAutoTable.finalY + 3;
    } else if (b.type === 'pre') {
      doc.setFont('courier', 'normal').setFontSize(9.5);
      const lines = b.text.split('\n').flatMap((l) => (l ? doc.splitTextToSize(latin(l), W - 6) : ['']));
      const lh = 9.5 * PT * 1.35;
      y += 1;
      for (const l of lines) {
        ensure(lh);
        doc.setFillColor(242, 243, 245).rect(M, y, W, lh, 'F');
        doc.setFont('courier', 'normal').setFontSize(9.5).setTextColor(...INK);
        doc.text(l, M + 3, y + lh * 0.75);
        y += lh;
      }
      y += 2.5;
    } else if (b.type === 'hr') {
      ensure(5);
      y += 2;
      doc.setDrawColor(200, 204, 210).setLineWidth(0.3).line(M, y, pw - M, y);
      y += 3;
    }
  }

  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
      doc.text(`${i} / ${pages}`, pw - M, ph - 8, { align: 'right' });
    }
  }
  return doc.output('blob');
}
