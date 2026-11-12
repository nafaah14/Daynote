/**
 * The report as a PDF, laid out like the office's Excel sheet printed to
 * A4 landscape: centred title, department line, grey header boxes, then one
 * grid with a coloured bar per section. Returns a Blob for PdfPreviewScreen.
 */
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import { reportTitle, headerLines, tableRows } from './report';

applyPlugin(jsPDF);

const hex = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const BLACK = [0, 0, 0];
const MARGIN = 14;
const WIDTHS = [11, 104, 22.5, 25.5, 17, 89]; // = 269 mm, the sheet's proportions

export function reportPdf(d) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const width = pw - MARGIN * 2;

  doc.setFont('times', 'bold').setFontSize(12).setTextColor(0, 0, 0);
  doc.text(reportTitle(d.month), pw / 2, 22, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`Department Name: ${d.department || ''}`, MARGIN + 1, 31);

  let y = 33;
  const boxH = 5.6;
  doc.setFontSize(10).setDrawColor(...BLACK).setLineWidth(0.25);
  for (const line of headerLines(d)) {
    // Text and fill share the PDF's colour state, so set the grey every box.
    doc.setFillColor(217, 217, 217);
    doc.rect(MARGIN, y, width, boxH, 'FD');
    doc.setTextColor(0, 0, 0);
    doc.text(line, MARGIN + 1.2, y + boxH - 1.6);
    y += boxH;
  }

  const body = tableRows(d).map((r) => (r.kind === 'section'
    ? [{ content: r.title, colSpan: 6, styles: { fillColor: hex(r.fill), fontStyle: 'bold', halign: 'left' } }]
    : [String(r.n), r.details, r.startText, r.endText, r.pct == null ? '' : String(r.pct), r.remarks]));

  doc.autoTable({
    startY: y + 7,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: width,
    theme: 'grid',
    head: [['#', 'Details', 'Start Date', 'COMPLETED\nor Estimated\ncompletion date', 'Completion\n%', 'Remarks/additional Notes']],
    body,
    styles: {
      font: 'times', fontSize: 9, textColor: BLACK, lineColor: BLACK, lineWidth: 0.15,
      cellPadding: { top: 1.1, bottom: 1.1, left: 1.4, right: 1.4 }, valign: 'middle', overflow: 'linebreak',
    },
    headStyles: { fillColor: [166, 166, 166], textColor: BLACK, fontStyle: 'normal', halign: 'center', fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: WIDTHS[0], halign: 'center' },
      1: { cellWidth: WIDTHS[1] },
      2: { cellWidth: WIDTHS[2], halign: 'center' },
      3: { cellWidth: WIDTHS[3], halign: 'center' },
      4: { cellWidth: WIDTHS[4], halign: 'right' },
      5: { cellWidth: WIDTHS[5] },
    },
    // "COMPLETED" is bold italic on the sheet and the rest of that heading
    // plain — one cell, two styles, so it's drawn by hand.
    willDrawCell: (c) => {
      if (c.section === 'head' && c.column.index === 3) c.cell.text = c.cell.text.map(() => '');
    },
    didDrawCell: (c) => {
      if (c.section !== 'head' || c.column.index !== 3) return;
      const cx = c.cell.x + c.cell.width / 2;
      const lh = 3.3;
      let ty = c.cell.y + c.cell.height / 2 - lh + 1.1;
      doc.setFont('times', 'bolditalic').setFontSize(8.5);
      doc.text('COMPLETED', cx, ty, { align: 'center' });
      doc.setFont('times', 'normal');
      doc.text('or Estimated', cx, (ty += lh), { align: 'center' });
      doc.text('completion date', cx, ty + lh, { align: 'center' });
    },
  });

  return doc.output('blob');
}
