import { describe, it, expect } from 'vitest';
import { personByName, deptMembers, deptFromOwner } from '../lib/people';

const person = (title, data = {}) => ({ id: title.toLowerCase().replace(/\W+/g, '-'), title, data });

const people = [
  person('Ahmed Shafeeu Mohamed', { dept: "Male' Power Generation Department" }),
  person('Mohamed Yasir', { dept: 'South Central Regional Department', ext: '244' }),
  person('Mohamed Yasir Ibrahim', { dept: 'South Central Regional Department' }),
  person('Aishath Nadha', { dept: "Male' Power Generation Department" }),
];

describe('personByName', () => {
  it('finds someone whose directory name carries an extra name', () => {
    expect(personByName(people, 'Ahmed Shafeeu').title).toBe('Ahmed Shafeeu Mohamed');
  });

  it('prefers the exact name over a longer one that contains it', () => {
    expect(personByName(people, 'Mohamed Yasir').title).toBe('Mohamed Yasir');
  });

  it('gives up rather than guess when two people could be meant', () => {
    expect(personByName(people, 'Mohamed')).toBeNull();
    expect(personByName(people, 'Yasir')).toBeNull();
  });

  it('returns nothing for a name the directory does not hold', () => {
    expect(personByName(people, 'Abdul Malik Thoufeeg')).toBeNull();
    expect(personByName(people, '')).toBeNull();
  });
});

describe('deptMembers', () => {
  it("matches Malé against the directory's Male' spelling", () => {
    expect(deptMembers(people, 'Malé Power Generation Department')).toHaveLength(2);
  });

  it('is empty for a department nobody is in', () => {
    expect(deptMembers(people, 'Hulhumalé Power Generation Department')).toEqual([]);
  });
});

describe('deptFromOwner', () => {
  it('treats a power generation department as a department', () => {
    expect(deptFromOwner('Hulhumalé Power Generation Department')).toBe('Hulhumalé Power Generation Department');
  });

  it('does not treat MACL as one', () => {
    expect(deptFromOwner('MACL (Maldives Airports Company Ltd.), managed internally, not STELCO')).toBeNull();
    expect(deptFromOwner('')).toBeNull();
  });
});
