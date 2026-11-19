import { describe, expect, it } from 'vitest';
import { alarmRinging, clockIntent, snoozedData, stoppedData } from '../alarm';

const at = (iso) => Date.parse(iso);
const rec = (data = {}, over = {}) => ({ id: 'r1', dueAt: '2026-11-19T04:00:00.000Z', doneAt: null, data: { alarm: true, ...data }, ...over });

describe('alarm reminders', () => {
  it('rings from its time for 12 hours, only when it is an alarm and open', () => {
    expect(alarmRinging(rec(), at('2026-11-19T03:59:00Z'))).toBe(false);
    expect(alarmRinging(rec(), at('2026-11-19T04:00:00Z'))).toBe(true);
    expect(alarmRinging(rec(), at('2026-11-19T16:01:00Z'))).toBe(false);
    expect(alarmRinging(rec({ alarm: false }), at('2026-11-19T04:01:00Z'))).toBe(false);
    expect(alarmRinging(rec({}, { doneAt: 'x' }), at('2026-11-19T04:01:00Z'))).toBe(false);
  });

  it('stop silences this date only; snooze rings again later', () => {
    const r = rec();
    expect(alarmRinging({ ...r, data: stoppedData(r) }, at('2026-11-19T04:05:00Z'))).toBe(false);
    expect(alarmRinging({ ...r, dueAt: '2026-11-20T04:00:00.000Z', data: stoppedData(r) }, at('2026-11-20T04:00:00Z'))).toBe(true);
    const s = { ...r, data: snoozedData(r, 10, at('2026-11-19T04:01:00Z')) };
    expect(alarmRinging(s, at('2026-11-19T04:05:00Z'))).toBe(false);
    expect(alarmRinging(s, at('2026-11-19T04:11:00Z'))).toBe(true);
    // A snooze from an earlier date doesn't hold back the next one.
    expect(alarmRinging({ ...s, dueAt: '2026-11-20T04:00:00.000Z' }, at('2026-11-20T04:00:00Z'))).toBe(true);
  });

  it("builds the Clock app's set-alarm link", () => {
    const url = clockIntent({ hour: 7, minute: 5, message: 'Call; Ali', fallback: 'https://x.app/reminders?clock=0' });
    expect(url).toBe('intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=7;i.android.intent.extra.alarm.MINUTES=5;S.android.intent.extra.alarm.MESSAGE=Call%3B%20Ali;S.browser_fallback_url=https%3A%2F%2Fx.app%2Freminders%3Fclock%3D0;end');
  });
});
