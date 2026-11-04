import { describe, expect, it } from 'vitest';
import { buildBounds, pageGraphics, rowsFromPage } from '../pdfRows';
import { buildPlan } from '../pdfDiff';
import { PERSON_TYPE } from '../../../core/people';

/* Coordinates and fonts are copied from a real SID 2.0 export; the people are made up. */
const NAME_SIZE = 8.71;
const INITIALS_SIZE = 8.09;

const text = (str, x0, top, size = NAME_SIZE, width = str.length * 4) => ({ text: str, x0, top, size, width });
const bounds = buildBounds({
  Name: 102.96, StaffID: 175.56, Job: 219.12, Dept: 289, Unit: 356, DIDNo: 432, EXTNo: 480, Mobile: 523,
});
const HEADER_BOTTOM = 88.56;
const ring = { left: 91.6, right: 135.6, top: 151.8, bottom: 195.8 };

function parse(items, images = [], lines = [97.2, 155, 204, 252, 301]) {
  return rowsFromPage(items, { images, lines }, bounds, HEADER_BOTTOM);
}

describe('rowsFromPage names', () => {
  it('keeps initials out when their baseline falls just below the first name', () => {
    const [row] = parse([
      text('AI', 109.68, 118, INITIALS_SIZE, 7.8),
      text('Hassan', 131.56, 117.64),
      text('Latheef', 102.96, 134.2),
      text('20003', 178.08, 123.6),
    ]);
    expect(row.name).toBe('Hassan Latheef');
  });

  it('reads a name below the avatar on one line or several', () => {
    const rows = parse([
      text('HL', 108, 118, INITIALS_SIZE),
      text('Hassan', 102.96, 134.6),
      text('Rauf Latheef', 102.96, 146.4),
      text('160102', 175.8, 130.2),
      text('SK', 108, 177.48, INITIALS_SIZE, 9.8),
      text('Sara Kamal', 102.96, 193.68),
      text('250055', 175.8, 183.12),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Hassan Rauf Latheef', 'Sara Kamal']);
  });

  it('keeps an all-caps word printed in the name font', () => {
    const [row] = parse([
      text('MD', 102.96, 134.6),
      text('Rauf', 130, 134.6),
      text('160102', 175.8, 130.2),
    ]);
    expect(row.name).toBe('MD Rauf');
  });
});

describe('rowsFromPage row bounds', () => {
  it('uses separator lines where a tall neighbour would break the midpoint', () => {
    const rows = parse([
      text('Short Row', 102.96, 125),
      text('160102', 175.8, 125),
      // tall row: its first department line is above the midpoint of the two IDs
      text('Long', 289, 165),
      text('Department', 289, 177),
      text('Tall Row', 102.96, 210),
      text('250055', 175.8, 210),
    ], [], [97.2, 155, 260]);
    expect(rows[0].dept).toBe('');
    expect(rows[1].dept).toBe('Long Department');
  });

  it('falls back to the midpoint with no separator lines', () => {
    const rows = parse([
      text('First', 102.96, 125),
      text('160102', 175.8, 125),
      text('Second', 102.96, 185),
      text('250055', 175.8, 185),
    ], [], []);
    expect(rows.map((r) => r.name)).toEqual(['First', 'Second']);
  });
});

describe('rowsFromPage fields', () => {
  it('flags only the avatar with a ring as unit head', () => {
    const rows = parse([
      text('HL', 108, 118, INITIALS_SIZE),
      text('Hassan Latheef', 102.96, 134.6),
      text('160102', 175.8, 130.2),
      text('SK', 108.72, 177.48, INITIALS_SIZE, 9.8),
      text('Sara Kamal', 102.96, 193.68),
      text('250055', 175.8, 183.12),
    ], [ring]);
    expect(rows.map((r) => r.isUnitHead)).toEqual([false, true]);
  });

  it('ignores the bell and blurred mobile images', () => {
    const [row] = parse([
      text('SK', 108.72, 177.48, INITIALS_SIZE, 9.8),
      text('Sara Kamal', 102.96, 193.68),
      text('250055', 175.8, 183.12),
    ], [
      { left: 70.7, right: 78.7, top: 183, bottom: 191.6 },
      { left: 519.6, right: 555, top: 170, bottom: 189.9 },
    ]);
    expect(row.isUnitHead).toBe(false);
  });

  it('treats a printed extension of 0 as blank', () => {
    const [row] = parse([text('Sara', 102.96, 125), text('160102', 175.8, 125), text('0', 485, 125)]);
    expect(row.ext).toBe('');
  });
});

describe('pageGraphics', () => {
  const OPS = { save: 1, restore: 2, transform: 3, paintImageXObject: 4, constructPath: 5 };

  it('finds images and thin wide lines through nested transforms', () => {
    const graphics = pageGraphics({
      fnArray: [1, 3, 4, 2, 5, 5, 5],
      argsArray: [
        null,
        [44, 0, 0, 44, 91.6, 596.2],
        ['img'],
        null,
        [28, [], [95.5, 636.96, 472.7, 637.68]], // separator
        [28, [], [53.9, 600, 558.6, 658]], // row-sized clip
        [28, [], [100, 500, 110, 500.5]], // short rule
      ],
    }, OPS, 792);
    expect(graphics.images).toHaveLength(1);
    expect(graphics.images[0].left).toBeCloseTo(91.6);
    expect(graphics.images[0].top).toBeCloseTo(151.8);
    expect(graphics.lines).toEqual([154.3]);
  });
});

describe('buildPlan unit head', () => {
  const person = (sid, isUnitHead) => ({
    id: sid, type: PERSON_TYPE, title: `Person ${sid}`, data: { sid, isUnitHead },
  });
  const repoWith = (people) => ({
    query: () => people,
    draft: (type, rec) => ({ type, ...rec }),
  });
  const row = (sid, isUnitHead) => ({ sid, name: `Person ${sid}`, isUnitHead });

  it('marks a new head and sets it on new staff', () => {
    const plan = buildPlan([row('1', true), row('2', true)], repoWith([person('1', false)]));
    expect(plan.changedRecords[0].changes).toEqual([
      { key: 'isUnitHead', label: 'Unit head', before: 'No', after: 'Yes', value: true },
    ]);
    expect(plan.newRecords[0].data.isUnitHead).toBe(true);
  });

  it('allows several heads in one file without demoting anyone else', () => {
    const plan = buildPlan([row('1', true), row('2', true)], repoWith([person('1', true), person('2', true)]));
    expect(plan.unchangedCount).toBe(2);
  });

  it('clears a head only when the file has rings at all', () => {
    const people = [person('1', true), person('2', false)];
    const withRings = buildPlan([row('1', false), row('2', true)], repoWith(people));
    expect(withRings.changedRecords[0].changes[0]).toMatchObject({ before: 'Yes', after: 'No', value: false });

    const noRings = buildPlan([row('1', false), row('2', false)], repoWith(people));
    expect(noRings.changedRecords).toHaveLength(0);
  });
});
