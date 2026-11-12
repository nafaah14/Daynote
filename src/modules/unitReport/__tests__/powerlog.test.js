import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  isoOf, parsePowerlog, cover, groupTasks, planImport, applyImport,
} from '../lib/powerlog';
import { blankRow } from '../lib/report';

/** Positioned text in the Powerlog layout (x positions from the real export). */
const X = { n: 43, type: 71, desc: 167, child: 184, start: 454, end: 522, staff: 584, status: 748 };
const HEAD = [
  ['Task', 37], ['Type', 71], ['Description', 167], ['Start', 464], ['End', 534], ['Staff', 584], ['Status', 748],
].map(([str, x]) => ({ str, x, y: 127 }));
const line = (y, cells) => Object.entries(cells).map(([k, str]) => ({ x: X[k], y, str }));

const page1 = [
  { str: 'MPH Electrical — Task Report', x: 34, y: 43 },
  { str: 'Period: October 2026', x: 34, y: 64 },
  ...HEAD,
  ...line(160, { n: '1', type: 'ROUTINE', desc: 'Battery systems check/ SWG sf6 press check/ battery water top', start: '27 Oct 2026', end: '27 Oct 2026', status: 'COMPLETED' }),
  ...line(170, { desc: 'up' }),
  ...line(190, { n: '2', type: 'MAJ. ELEC', desc: 'CG3: Alternator service › CG3: Alternator service - Decouple', start: '6 Oct 2026', end: '6 Oct 2026', status: 'ONGOING' }),
  ...line(200, { desc: 'alternator' }),
  ...line(220, { child: '!³ Worked on this day', start: '6 Oct 2026', staff: 'Shafeeq', status: 'Done' }),
  ...line(230, { child: 'monitor' }),
  ...line(250, { n: '3', type: 'REPAIR / SERVICING', desc: 'DG6: ESM overspeed shutdown troubleshooting', start: '4 Oct 2026', end: '4 Oct 2026', status: 'COMPLETED' }),
  ...line(260, { type: '[ISSUE]', desc: 'DG6 / PLC/Control' }),
  { str: 'Generated 11/12/2026, 5:08:04 PM | By: someone', x: 34, y: 570 },
];
const page2 = [
  ...HEAD,
  ...line(160, { n: '4', type: 'MAJ. ELEC', desc: 'CG3: Alternator service › CG3: Alternator service - Battery connection', start: '28 Oct 2026', end: '28 Oct 2026', status: 'COMPLETED' }),
  ...line(190, { n: '5', type: 'ROUTINE', desc: 'DG1: Replace alternator filters', start: '6 Oct 2026', end: '6 Oct 2026', status: 'CANCELLED' }),
];
const parsed = () => parsePowerlog([{ items: page1 }, { items: page2 }]);

describe('parsePowerlog', () => {
  const { period, tasks } = parsed();

  it('reads the period, numbered tasks and wrapped descriptions', () => {
    expect(period).toBe('2026-10');
    expect(tasks.map((t) => t.n)).toEqual([1, 2, 3, 4, 5]);
    expect(tasks[0]).toMatchObject({
      details: 'Battery systems check/ SWG sf6 press check/ battery water top up',
      start: '2026-10-27', status: 'COMPLETED', routine: true,
    });
  });

  it('splits "Parent › step", and skips worked-day lines and the issue system line', () => {
    expect(tasks[1]).toMatchObject({ parent: 'CG3: Alternator service', step: 'Decouple alternator' });
    expect(tasks[2].details).toBe('DG6: ESM overspeed shutdown troubleshooting');
    expect(tasks[2].type).toBe('REPAIR / SERVICING [ISSUE]');
  });

  it('reads dates', () => {
    expect(isoOf('1 Oct 2026')).toBe('2026-10-01');
    expect(isoOf('Done')).toBe('');
  });

  it('rolls sub-tasks up under their parent', () => {
    const g = groupTasks(tasks).find((x) => x.details === 'CG3: Alternator service');
    expect(g).toMatchObject({ start: '2026-10-06', end: '2026-10-28', status: 'ONGOING', steps: ['Decouple alternator', 'Battery connection'] });
  });
});

describe('matching', () => {
  it('needs the same engine and most of the words', () => {
    expect(cover('Battery systems check/ Switchgear SF6 level check', 'Battery systems check/ SWG sf6 press check/ battery water top up')).toBeGreaterThan(0.6);
    expect(cover('DG6: Replace alternator filters', 'DG8: Replace alternator filters')).toBe(0);
    expect(cover('DG09: Replace alternator filters', 'DG9 replace alternator filter')).toBe(1);
  });
});

describe('planImport / applyImport', () => {
  const { tasks } = parsed();
  const report = {
    month: '2026-10',
    tasks: [blankRow({ details: 'CG3: Alternator service' })],
    routine: [blankRow({ details: 'Battery systems check/ Switchgear SF6 level check' }), blankRow({ details: 'Blackstart genset testing' })],
    planned: [],
  };
  const plan = planImport(report, tasks);

  it('puts matching work on its routine check and leaves the rest blank', () => {
    expect(plan.checks).toEqual(report.routine.map((r) => r.details));
    const battery = plan.items.find((i) => i.details.startsWith('Battery'));
    expect(battery).toMatchObject({ to: 'check:Battery systems check/ Switchgear SF6 level check', auto: true });
    expect(plan.items.filter((i) => i.to === 'check:Blackstart genset testing')).toEqual([]);
  });

  it('proposes the rest as tasks, updating a row already on the report', () => {
    expect(plan.items.find((i) => i.key === 'cg3 alternator service').matchRowId).toBe(report.tasks[0].id);
    expect(plan.items.find((i) => i.details.startsWith('DG1')).include).toBe(false); // cancelled
    expect(plan.items.find((i) => i.details.startsWith('DG6')).pct).toBe('100');
  });

  it('applies the reviewed plan, and importing again updates instead of duplicating', () => {
    const once = applyImport(report, plan);
    expect(once.routine.map((r) => [r.start, r.end])).toEqual([['2026-10-27', '2026-10-27'], ['', '']]);
    expect(once.tasks.map((t) => t.details)).toEqual(['DG6: ESM overspeed shutdown troubleshooting', 'CG3: Alternator service']);
    expect(once.tasks[1]).toMatchObject({ start: '2026-10-06', end: '2026-10-28' });
    const twice = applyImport(once, planImport(once, tasks));
    expect(twice.tasks).toHaveLength(2);
  });

  it('adds back a dropped standard check only when work matched it', () => {
    const checks = report.routine.map((r) => r.details);
    const empty = { ...report, routine: [] };
    const p = planImport(empty, tasks, checks);
    expect(p.checks).toEqual(checks);
    expect(p.dropped).toEqual(checks);
    const out = applyImport(empty, p);
    expect(out.routine.map((r) => [r.details, r.start])).toEqual([
      ['Battery systems check/ Switchgear SF6 level check', '2026-10-27'],
    ]);
  });

  it('lets you pick any Powerlog job for a routine check', () => {
    const p = planImport(report, tasks, ['Blackstart genset testing']);
    const dg6 = p.items.find((i) => i.details.startsWith('DG6'));
    dg6.to = 'check:Blackstart genset testing';
    const out = applyImport(report, p);
    expect(out.routine.find((r) => r.details === 'Blackstart genset testing')).toMatchObject({ start: '2026-10-04', end: '2026-10-04' });
    expect(out.tasks.some((t) => t.details.startsWith('DG6'))).toBe(false);
  });
});

// The real October 2026 export: checked on this machine only, never committed.
const REAL = process.env.POWERLOG_PDF
  || 'C:/Users/salaf/.claude/uploads/322da7a8-86a6-4179-9cfa-0fd6d46bfb3e/83ae2298-Task_Report_October_2026.pdf';

describe.skipIf(!existsSync(REAL))('real Powerlog export (October 2026)', () => {
  it('reads every task, matching the header totals', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(REAL)), verbosity: 0 }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const h = page.getViewport({ scale: 1 }).height;
      const c = await page.getTextContent();
      pages.push({ items: c.items.map((i) => ({ x: i.transform[4], y: h - i.transform[5], str: i.str })) });
    }
    const { period, tasks } = parsePowerlog(pages);
    expect(period).toBe('2026-10');
    expect(tasks).toHaveLength(89); // "89 Tasks"
    const by = (s) => tasks.filter((t) => t.status === s).length;
    expect([by('COMPLETED'), by('ONGOING'), by('CANCELLED')]).toEqual([26, 60, 3]);
    expect(tasks[37].details).toMatch(/Replace auxiliary panel BJA cooling fan$/); // runs onto page 6
    expect(tasks[26].details).toMatch(/B side bearing temperature sensor cable gland$/); // runs onto page 5

    const sept = ['Blackstart genset testing', 'Battery systems check/ Switchgear SF6 level check', 'Clean MV/LV switchgear and battery room', 'DG6: Replace alternator filters'];
    const plan = planImport({
      month: '2026-10',
      tasks: [blankRow({ details: 'Switchboard A auxiliary transformer T1 ACB installation work', start: '2026-09-29' }), blankRow({ details: 'CG3: Alternator service' })],
      routine: sept.map((d) => blankRow({ details: d })),
    }, tasks);
    expect(plan.items.filter((i) => i.auto).map((i) => [i.to, i.source])).toEqual([
      ['check:Battery systems check/ Switchgear SF6 level check', 'Battery systems check/ SWG sf6 press check/ battery water top up'],
    ]);
    expect(plan.items.filter((i) => i.matchRowId).map((i) => i.details)).toEqual([
      'Switchboard A auxiliary transformer T1 ACB installation work', 'CG3: Alternator service',
    ]);
    expect(plan.items.find((i) => i.details === 'Control room renovation work - flooring installation').remarks)
      .toBe('Workstation table top fomica installation; Install cable tray under work desk and re-route PC and communication cables; remove old AC DB cables and cable ducts in wartsila control room');
  });
});
