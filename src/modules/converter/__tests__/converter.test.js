import { describe, it, expect } from 'vitest';
import { categoryById, convert } from '../lib/units';
import { parseInput, formatNumber } from '../lib/format';
import { convertCurrency, isStale, loadCachedRates, saveCachedRates, fetchRates } from '../lib/currency';
import {
  ampsToKva, ampsToKw, ampsToOutputKw, kwToAmps, kvaToAmps, powerTriangle, voltageDrop, ahToWh,
} from '../lib/electrical';

const c = (id, v, from, to) => convert(v, categoryById(id), from, to);

describe('unit conversion (published definitions)', () => {
  it('length', () => {
    expect(c('length', 1, 'mi', 'm')).toBeCloseTo(1609.344, 6);
    expect(c('length', 12, 'in', 'ft')).toBeCloseTo(1, 9);
    expect(c('length', 1, 'nmi', 'km')).toBeCloseTo(1.852, 9);
  });
  it('volume, weight, area', () => {
    expect(c('volume', 1, 'gal', 'L')).toBeCloseTo(3.785411784, 9);
    expect(c('weight', 1, 'lb', 'kg')).toBeCloseTo(0.45359237, 9);
    expect(c('area', 1, 'ac', 'm2')).toBeCloseTo(4046.8564224, 6);
  });
  it('temperature', () => {
    expect(c('temperature', 0, 'C', 'F')).toBeCloseTo(32, 9);
    expect(c('temperature', 100, 'C', 'F')).toBeCloseTo(212, 9);
    expect(c('temperature', -40, 'C', 'F')).toBeCloseTo(-40, 9);
    expect(c('temperature', 0, 'C', 'K')).toBeCloseTo(273.15, 9);
  });
  it('speed, time, data, pressure, power, energy', () => {
    expect(c('speed', 36, 'kmh', 'ms')).toBeCloseTo(10, 9);
    expect(c('time', 1, 'd', 'h')).toBeCloseTo(24, 9);
    expect(c('data', 1, 'GiB', 'MiB')).toBeCloseTo(1024, 9);
    expect(c('pressure', 1, 'atm', 'kPa')).toBeCloseTo(101.325, 9);
    expect(c('power', 1, 'hp', 'W')).toBeCloseTo(745.7, 1);
    expect(c('power', 1, 'kW', 'btuh')).toBeCloseTo(3412.14, 1);
    expect(c('energy', 1, 'kWh', 'MJ')).toBeCloseTo(3.6, 9);
  });
  it('round-trips and unknown units', () => {
    expect(c('length', c('length', 7.5, 'ft', 'cm'), 'cm', 'ft')).toBeCloseTo(7.5, 9);
    expect(c('length', 1, 'm', 'nope')).toBeNaN();
  });
});

describe('input parsing and formatting', () => {
  it('parses numbers and simple expressions', () => {
    expect(parseInput('12.5')).toBe(12.5);
    expect(parseInput('5*12')).toBe(60);
    expect(parseInput('(3+4)/2')).toBe(3.5);
    expect(parseInput('1,5')).toBe(1.5);
    expect(parseInput('1,000.5')).toBe(1000.5);
    expect(parseInput('-2+5')).toBe(3);
  });
  it('rejects junk instead of evaluating it', () => {
    expect(parseInput('')).toBeNaN();
    expect(parseInput('abc')).toBeNaN();
    expect(parseInput('2+')).toBeNaN();
    expect(parseInput('alert(1)')).toBeNaN();
  });
  it('formats readably', () => {
    expect(formatNumber(1234.5678)).toBe('1,234.568');
    expect(formatNumber(0.5)).toBe('0.5');
    expect(formatNumber(NaN)).toBe('—');
  });
});

describe('currency', () => {
  const rates = { MVR: 15.4, EUR: 0.9 };
  it('crosses through USD', () => {
    expect(convertCurrency(100, 'USD', 'MVR', rates)).toBeCloseTo(1540, 6);
    expect(convertCurrency(15.4, 'MVR', 'USD', rates)).toBeCloseTo(1, 9);
    expect(convertCurrency(15.4, 'MVR', 'EUR', rates)).toBeCloseTo(0.9, 9);
  });
  it('is NaN for an unpriced currency', () => {
    expect(convertCurrency(1, 'USD', 'XXX', rates)).toBeNaN();
  });
  it('treats old or missing cache as stale', () => {
    const now = Date.now();
    expect(isStale(null, now)).toBe(true);
    expect(isStale({ fetchedAt: now - 1000 }, now)).toBe(false);
    expect(isStale({ fetchedAt: now - 13 * 3600e3 }, now)).toBe(true);
  });
  it('caches and fetches', async () => {
    const mem = { v: null, getItem() { return this.v; }, setItem(_k, v) { this.v = v; } };
    saveCachedRates({ rates, fetchedAt: 5 }, mem);
    expect(loadCachedRates(mem)).toEqual({ rates, fetchedAt: 5 });
    const ok = async () => ({ ok: true, json: async () => ({ result: 'success', rates }) });
    expect(await fetchRates(ok, 9)).toEqual({ rates, fetchedAt: 9 });
    await expect(fetchRates(async () => ({ ok: false, status: 500 }))).rejects.toThrow();
  });
});

describe('electrical (hand-checked)', () => {
  it('three-phase 400 V, 50 A, pf 0.8', () => {
    const a = { phase: 3, volts: 400, amps: 50, pf: 0.8 };
    expect(ampsToKva(a)).toBeCloseTo(34.641, 3);
    expect(ampsToKw(a)).toBeCloseTo(27.713, 3);
    expect(ampsToOutputKw({ ...a, eff: 0.9 })).toBeCloseTo(24.942, 3);
  });
  it('single-phase 230 V, 10 A, pf 1', () => {
    expect(ampsToKw({ phase: 1, volts: 230, amps: 10, pf: 1 })).toBeCloseTo(2.3, 9);
  });
  it('amps <-> kW round-trip', () => {
    expect(kwToAmps({ phase: 3, volts: 400, kw: 27.7128, pf: 0.8 })).toBeCloseTo(50, 3);
    expect(kwToAmps({ phase: 1, volts: 230, kw: 2.3, pf: 1 })).toBeCloseTo(10, 9);
  });
  it('kVA to full-load current', () => {
    expect(kvaToAmps({ phase: 3, volts: 400, kva: 100 })).toBeCloseTo(144.34, 2);
    expect(kvaToAmps({ phase: 1, volts: 230, kva: 5 })).toBeCloseTo(21.739, 3);
  });
  it('power triangle from any pair', () => {
    const r = powerTriangle({ kw: 80, kva: 100 });
    expect(r.kvar).toBeCloseTo(60, 9);
    expect(r.pf).toBeCloseTo(0.8, 9);
    expect(powerTriangle({ kw: 80, pf: 0.8 }).kva).toBeCloseTo(100, 9);
    expect(powerTriangle({ kva: 100, pf: 0.8 }).kvar).toBeCloseTo(60, 9);
    expect(powerTriangle({ kw: 80, kvar: 60 }).kva).toBeCloseTo(100, 9);
    expect(powerTriangle({ kvar: 60, pf: 0.8 }).kw).toBeCloseTo(80, 9);
    expect(powerTriangle({ kw: 120, kva: 100 })).toBeNull();
    expect(powerTriangle({ kw: 5 })).toBeNull();
  });
  it('voltage drop', () => {
    // 3-phase, 32 A, 50 m, 10 mm2 copper: sqrt3 * 0.0225 * 50 * 32 / 10 = 6.235 V
    const d = voltageDrop({ phase: 3, amps: 32, length: 50, area: 10, volts: 400 });
    expect(d.volts).toBeCloseTo(6.235, 3);
    expect(d.percent).toBeCloseTo(1.559, 3);
    // single-phase counts the return conductor: 2 * 0.0225 * 20 * 10 / 2.5 = 3.6 V
    expect(voltageDrop({ phase: 1, amps: 10, length: 20, area: 2.5, volts: 230 }).volts).toBeCloseTo(3.6, 9);
  });
  it('battery', () => {
    expect(ahToWh(100, 12)).toBe(1200);
  });
});
