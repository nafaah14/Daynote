import { describe, it, expect } from 'vitest';
import {
  UNITS, find, responsibleFor, searchPlaces, regionInhabited, unitsOf, outsideUnit,
} from '../lib/regions';

/* The counts in the circular. If a data rebuild moves an atoll between
   regions by accident, these are what catch it. */
describe('region coverage', () => {
  it('matches the circular: W 54 · S 42 · D 55 · Y 36 inhabited islands', () => {
    expect(regionInhabited('W')).toBe(54);
    expect(regionInhabited('S')).toBe(42);
    expect(regionInhabited('D')).toBe(55);
    expect(regionInhabited('Y')).toBe(36);
  });

  it('covers every unit exactly once, with only Malé/Hulhumalé/Hulhulé outside', () => {
    const inRegions = ['W', 'S', 'D', 'Y'].flatMap((k) => unitsOf(k));
    expect(inRegions.length + 1).toBe(UNITS.length);
    expect(outsideUnit().isl.map((i) => i.n)).toEqual(['Malé', 'Hulhumalé', 'Hulhulé']);
  });

  it('puts Vilimalé in S and keeps it apart from GA Vilingili', () => {
    expect(find('Vilimalé')[0].region).toBe('S');
    expect(find('Vilingili')[0].atollCode).toBe('GA');
  });
});

describe('find', () => {
  it('returns every atoll an island name appears in, not just the first', () => {
    const hits = find('Maalhos');
    expect(hits.map((h) => h.atollCode)).toEqual(['B', 'AA']);
    expect(hits.map((h) => h.gm)).toEqual(['Ahmed Shafeeu', 'Mohamed Yasir']);
  });

  it('ignores accents and apostrophes', () => {
    expect(find('hulhule')[0].managedBy).toMatch(/^MACL/);
    expect(find('hulhule')[0].region).toBeNull();
  });

  it('answers for an atoll name or its code', () => {
    expect(find('Thaa')[0].regionName).toBe('South Central Regional Department');
    expect(find('Th')[0].region).toBe('D');
  });
});

describe('responsibleFor', () => {
  it('names the GM for an atoll code plus island', () => {
    const r = responsibleFor('Th', 'Veymandoo');
    expect(r.gm).toBe('Mohamed Yasir');
    expect(r.isCapital).toBe(true);
    expect(r.type).toBe('Inhabited island');
  });

  it('gives Malé its own department rather than a region', () => {
    const r = responsibleFor('MC', 'Malé');
    expect(r.region).toBeNull();
    expect(r.managedBy).toBe('Malé Power Generation Department');
  });

  it('is null for an island that is not in that atoll', () => {
    expect(responsibleFor('Th', 'Maalhos')).toBeNull();
    expect(responsibleFor('ZZ', 'Veymandoo')).toBeNull();
  });
});

describe('searchPlaces', () => {
  it('puts what you typed first, before islands that merely contain it', () => {
    expect(searchPlaces('vey')[0].label).toBe('Veymandoo');
  });

  it('carries the answer with each hit, so the list reads without a lookup', () => {
    const hit = searchPlaces('hulhumale')[0];
    expect(hit.unitId).toBe('MC');
    expect(hit.detail).toBe('Hulhumalé Power Generation Department');
  });

  it('is empty for blank input rather than returning everything', () => {
    expect(searchPlaces('   ')).toEqual([]);
  });
});
