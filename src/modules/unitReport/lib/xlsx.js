/**
 * The report as an .xlsx in the office sheet's layout — merged title and
 * header boxes, grey column heading, coloured section bars, real dates
 * (dd-mm-yyyy) and numbers so it stays editable. exceljs is ~1 MB, so it's
 * imported only when someone actually exports.
 */
import { reportTitle, headerLines, tableRows, monthName } from './report';

const FONT = { name: 'Times New Roman', size: 11 };
const thin = { style: 'thin', color: { argb: 'FF000000' } };
const BOX = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (rgb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${rgb}` } });
const asDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export async function reportXlsx(d) {
  const mod = await import('exceljs');
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet(monthName(d.month).slice(0, 31), {
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false }],
  });
  ws.columns = [6, 62, 13, 14, 11, 52].map((width) => ({ width }));

  const merged = (rowNo, value, { font = {}, center = false, cellFill, border, height } = {}) => {
    ws.mergeCells(rowNo, 1, rowNo, 6);
    const cell = ws.getCell(rowNo, 1);
    cell.value = value;
    cell.font = { ...FONT, bold: true, ...font };
    cell.alignment = { vertical: 'middle', horizontal: center ? 'center' : 'left', wrapText: true };
    if (cellFill) for (let c = 1; c <= 6; c++) ws.getCell(rowNo, c).fill = fill(cellFill);
    if (border) for (let c = 1; c <= 6; c++) ws.getCell(rowNo, c).border = BOX;
    if (height) ws.getRow(rowNo).height = height;
  };

  let r = 2;
  merged(r, reportTitle(d.month), { font: { size: 12 }, center: true, height: 20 });
  r += 2;
  merged(r++, `Department Name: ${d.department || ''}`, { font: { size: 12 } });
  for (const line of headerLines(d)) merged(r++, line, { cellFill: 'D9D9D9', border: true });
  r++;

  const headRow = r;
  const heads = ['#', 'Details', 'Start Date', null, 'Completion %', 'Remarks/additional Notes'];
  heads.forEach((h, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = h ?? {
      richText: [
        { text: 'COMPLETED', font: { ...FONT, bold: true, italic: true } },
        { text: '\nor Estimated completion date', font: FONT },
      ],
    };
    cell.font = FONT;
    cell.fill = fill('A6A6A6');
    cell.border = BOX;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  ws.getRow(r).height = 44;
  r++;

  for (const row of tableRows(d)) {
    if (row.kind === 'section') {
      merged(r++, row.title, { cellFill: row.fill, border: true });
      continue;
    }
    const values = [
      row.n, row.details,
      row.start ? asDate(row.start) : row.startText || null,
      row.end ? asDate(row.end) : row.endText || null,
      row.pct, row.remarks || null,
    ];
    values.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v;
      cell.font = FONT;
      cell.border = BOX;
      cell.alignment = {
        vertical: 'middle', wrapText: i === 1 || i === 5,
        horizontal: i === 0 || i === 2 || i === 3 ? 'center' : i === 4 ? 'right' : 'left',
      };
      if (v instanceof Date) cell.numFmt = 'dd-mm-yyyy';
    });
    r++;
  }

  ws.pageSetup.printTitlesRow = `${headRow}:${headRow}`;
  ws.pageSetup.printArea = `A1:F${r - 1}`;

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
