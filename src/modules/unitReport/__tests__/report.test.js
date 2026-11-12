import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import {
  fileBase, tableRows, nextMonthData, byStart, rowsFromText, sectionTitle, addMonths, dmy, blankRow, missingChecks,
} from '../lib/report';
import { reportPdf } from '../lib/pdf';
import { reportXlsx } from '../lib/xlsx';

const t = (details, start, end, pct, remarks = '') => blankRow({ details, start, end, pct: String(pct ?? ''), remarks });

/** The September 2026 sheet, as sent to the unit head meeting. */
const SEPT = {
  month: '2026-09',
  department: 'Male Power Generation Department',
  unit: 'Electrical Services',
  head: 'Ali Nafaah Mohamed / Chief Electrical Engineer',
  staff: '15',
  tasks: [
    t('DG07 Major Overhaul', '2026-08-22', '2026-09-29', 100, 'Major overhaul completed and Engine back in operation'),
    t('DG5: Calibrate Spring bellow level low sensor no 2', '2026-09-02', '2026-09-02', 100),
    t('MED plant electrical cable reconnections', '2026-09-02', '2026-09-02', 100, 'Connecting MED plant connections after relocation'),
    t('Attend power interruption: Transformer T2 trip / Loadshedding and power restoration', '2026-09-16', '2026-09-16', 100),
    t('Billabong high school info session and tour of Male’ powerhouse', '2026-09-24', '2026-09-24', 100),
    t('Switchboard A auxiliary transformer T1 ACB installation work', '2026-09-29', '2026-09-30', 50),
    t('DG9 LO Separator: Check feed pump motor winding insulation/ bearing', '2026-09-30', '2026-09-30', 100, 'Motor winding damaged, sent for rewinding'),
  ],
  routine: [
    t('Blackstart genset testing', '', '', null),
    t('Battery systems check/ Switchgear SF6 level check', '2026-09-21', '2026-09-21', null),
    t('DG6: Replace alternator filters', '2026-09-23', '2026-09-23', null),
  ],
  planned: [
    t('Switchboard A auxiliary transformer T1 ACB installation work'),
    t('Blackout SOP training for Duty staff and Mechanical Staff'),
    t('CG3: Alternator service'),
  ],
};

describe('report text', () => {
  it('names the file like the office does', () => {
    expect(fileBase(SEPT)).toBe('9. Male Power Generation - Electrical Services - Unit Head Report for the month of September 2026');
  });

  it('titles the sections for the month and the next one', () => {
    expect(sectionTitle('tasks', '2026-09')).toBe('Tasks/Projects carried out for the month of September 2026');
    expect(sectionTitle('planned', '2026-12')).toBe('Tasks/Projects planned for the month of January 2027');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(dmy('2026-09-02')).toBe('02-09-2026');
  });

  it('numbers each section from 1 and dashes undated routine rows', () => {
    const rows = tableRows(SEPT);
    expect(rows.filter((r) => r.kind === 'section').map((r) => r.key)).toEqual(['tasks', 'routine', 'planned']);
    const routine = rows.filter((r) => r.key === 'routine' && r.kind === 'row');
    expect(routine.map((r) => r.n)).toEqual([1, 2, 3]);
    expect(routine[0].startText).toBe('-');
    expect(routine[1].startText).toBe('21-09-2026');
    expect(rows.find((r) => r.key === 'planned' && r.kind === 'row').startText).toBe('');
  });
});

describe('nextMonthData', () => {
  it('turns plans and unfinished tasks into the new month, without duplicates', () => {
    const oct = nextMonthData({ data: SEPT }, '2026-10');
    expect(oct.month).toBe('2026-10');
    expect(oct.head).toBe(SEPT.head);
    expect(oct.tasks.map((r) => r.details)).toEqual([
      'Switchboard A auxiliary transformer T1 ACB installation work',
      'Blackout SOP training for Duty staff and Mechanical Staff',
      'CG3: Alternator service',
    ]);
    expect(oct.routine.map((r) => [r.details, r.start])).toEqual(SEPT.routine.map((r) => [r.details, '']));
    expect(oct.planned).toEqual([]);
  });

  it('starts routine from the standard checks when they are set', () => {
    const oct = nextMonthData({ data: SEPT }, '2026-10', undefined, ['Blackstart genset testing', 'Fire pump test run']);
    expect(oct.routine.map((r) => [r.details, r.start])).toEqual([['Blackstart genset testing', ''], ['Fire pump test run', '']]);
    expect(missingChecks(['Blackstart genset testing', 'Fire pump test run'], SEPT.routine)).toEqual(['Fire pump test run']);
  });

  it('keeps an unfinished task with its start date when it was not planned', () => {
    const oct = nextMonthData({ data: SEPT }, '2026-10', { carry: true, plans: false, routine: false });
    expect(oct.tasks).toHaveLength(1);
    expect(oct.tasks[0].start).toBe('2026-09-29');
    expect(oct.routine).toEqual([]);
  });
});

describe('helpers', () => {
  it('sorts by start date, undated last', () => {
    const rows = [t('b', '2026-09-10'), t('none'), t('a', '2026-09-02')];
    expect(byStart(rows).map((r) => r.details)).toEqual(['a', 'b', 'none']);
  });

  it('reads pasted lines, dropping list numbers', () => {
    expect(rowsFromText('1. DG4: preheater\n2) T3 ACB\n\n  Rack fabrication ').map((r) => r.details))
      .toEqual(['DG4: preheater', 'T3 ACB', 'Rack fabrication']);
  });
});

describe('exports', () => {
  it('makes a PDF', async () => {
    const blob = reportPdf(SEPT);
    const buf = Buffer.from(await blob.arrayBuffer());
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    if (process.env.UR_OUT) writeFileSync(`${process.env.UR_OUT}/sept.pdf`, buf);
  });

  it('makes an Excel sheet with real dates and the sheet layout', async () => {
    const blob = await reportXlsx(SEPT);
    const buf = Buffer.from(await blob.arrayBuffer());
    if (process.env.UR_OUT) writeFileSync(`${process.env.UR_OUT}/sept.xlsx`, buf);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A2').value).toBe('Work Details for Unit Head Meeting (September 2026)');
    expect(ws.getCell('A4').value).toBe('Department Name: Male Power Generation Department');
    expect(ws.getCell('A10').value).toBe('Tasks/Projects carried out for the month of September 2026');
    expect(ws.getCell('B11').value).toBe('DG07 Major Overhaul');
    expect(ws.getCell('C11').value).toEqual(new Date(Date.UTC(2026, 7, 22)));
    expect(ws.getCell('C11').numFmt).toBe('dd-mm-yyyy');
    expect(ws.getCell('E16').value).toBe(50);
  });
});
