import { describe, it, expect } from 'vitest';
import {
  parseHHMM, formatHHMM, formatLong, toDecimal, worked, sumMinutes, runningTotals, crossingIndex,
} from '../lib/hhmm';
import { sanitize, loadState, saveState, sendToHours, initialState, DAYS, STORE_KEY } from '../lib/store';

const mins = (t, o) => parseHHMM(t, o).minutes;

describe('parseHHMM', () => {
  it('accepts the same time typed several ways', () => {
    for (const t of ['08:00', '8:00', '0800', '800', '8', '08']) expect(mins(t)).toBe(480);
    expect(mins('945')).toBe(585);
    expect(mins('1738')).toBe(1058);
    expect(mins('17:38')).toBe(1058);
    expect(mins('0')).toBe(0);
  });
  it('allows durations past 24h but not clock times', () => {
    expect(mins('125:30')).toBe(7530);
    expect(mins('12530')).toBe(7530);
    expect(parseHHMM('24:00', { clock: true }).ok).toBe(false);
    expect(parseHHMM('2400', { clock: true }).ok).toBe(false);
    expect(parseHHMM('12530', { clock: true }).ok).toBe(false);
    expect(mins('23:59', { clock: true })).toBe(1439);
  });
  it('rejects instead of guessing', () => {
    for (const t of ['0875', '2460', '8:75', 'abc', '8.30', '8:5', '123456']) expect(parseHHMM(t).ok).toBe(false);
    const empty = parseHHMM('  ');
    expect(empty.ok).toBe(false);
    expect(empty.empty).toBe(true);
  });
});

describe('formatting', () => {
  it('formats hh:mm, long form and decimal', () => {
    expect(formatHHMM(158)).toBe('02:38');
    expect(formatHHMM(5)).toBe('00:05');
    expect(formatHHMM(7500)).toBe('125:00');
    expect(formatHHMM(-90)).toBe('-01:30');
    expect(formatLong(158)).toBe('2h 38m');
    expect(toDecimal(158)).toBe('2.63');
    expect(toDecimal(480)).toBe('8.00');
  });
});

describe('worked time between clock times', () => {
  it('15:00 to 17:38 is 2h 38m', () => {
    expect(worked(mins('1500'), mins('1738'))).toEqual({ minutes: 158, nextDay: false });
  });
  it('crossing midnight is flagged as next day', () => {
    expect(worked(mins('2200'), mins('0130'))).toEqual({ minutes: 210, nextDay: true });
  });
  it('equal times are zero', () => {
    expect(worked(mins('0900'), mins('0900'))).toEqual({ minutes: 0, nextDay: false });
  });
});

describe('adding hours against the 48h line', () => {
  // Hand-checked: 8:00 + 10:00 + 9:30 + 10:15 + 8:45 + 4:00
  //   running: 8:00, 18:00, 27:30, 37:45, 46:30, 50:30  -> first >= 48:00 on the 6th entry
  const week = ['0800', '1000', '0930', '1015', '0845', '0400'].map((t) => mins(t));
  it('totals and running totals', () => {
    expect(sumMinutes(week)).toBe(50 * 60 + 30);
    expect(runningTotals(week).map(formatHHMM)).toEqual(['08:00', '18:00', '27:30', '37:45', '46:30', '50:30']);
  });
  it('finds the line that reaches the target', () => {
    expect(crossingIndex(week, 48 * 60)).toBe(5);
    expect(crossingIndex(week.slice(0, 5), 48 * 60)).toBe(-1);
    // a blank line in the middle is skipped, never counted as the crossing line
    expect(crossingIndex([mins('2400'), NaN, mins('2400')], 48 * 60)).toBe(2);
  });
  it('exactly on the target counts as reached', () => {
    expect(crossingIndex([mins('2400'), mins('2400')], 48 * 60)).toBe(1);
  });
  it('ignores blank lines in the total', () => {
    expect(sumMinutes([480, NaN, 600])).toBe(1080);
  });
});

describe('stored state', () => {
  const mem = () => ({ v: null, getItem() { return this.v; }, setItem(_k, v) { this.v = v; } });
  it('starts with a Sun-Sat week of hours and one worked line', () => {
    const s = initialState();
    expect(s.hours.map((h) => h.label)).toEqual(DAYS);
    expect(s.worked).toHaveLength(1);
    expect(s.target).toBe('48:00');
  });
  it('round-trips', () => {
    const storage = mem();
    const s = initialState();
    s.hours[0].value = '08:00';
    s.tab = 'hours';
    saveState(s, storage);
    expect(JSON.parse(storage.v)).toBeTruthy();
    const back = loadState(storage);
    expect(back.hours[0].value).toBe('08:00');
    expect(back.tab).toBe('hours');
  });
  it('survives blank or corrupt storage', () => {
    expect(loadState(mem()).hours).toHaveLength(7);
    const bad = mem(); bad.v = '{not json';
    expect(loadState(bad).worked).toHaveLength(1);
    expect(sanitize({ hours: 'x', worked: [null, 5], tab: 'nope' }).tab).toBe('worked');
    expect(sanitize({ hours: [{ label: 'Mon', value: 7 }] }).hours[0].value).toBe('');
    expect(STORE_KEY).toContain('timecalc');
  });
  it('sends a worked result to the first empty hours line, else appends', () => {
    const hours = [{ id: 'a', label: 'Sun', value: '08:00' }, { id: 'b', label: 'Mon', value: '' }];
    const one = sendToHours(hours, '', '02:38');
    expect(one[1].value).toBe('02:38');
    expect(one[1].label).toBe('Mon');
    const full = sendToHours(one, 'Wed OT', '01:00');
    expect(full).toHaveLength(3);
    expect(full[2]).toMatchObject({ label: 'Wed OT', value: '01:00' });
  });
});
