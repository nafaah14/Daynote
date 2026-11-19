/**
 * Alarm reminders: a reminder with a time and `data.alarm` rings (AlarmHost
 * in core) instead of only notifying. State lives on the record so it syncs
 * — stopping it on the phone stops the PC too:
 *   data.alarmStopped     the dueAt it was stopped for (a new date rings again)
 *   data.alarmSnoozeUntil ISO time it rings again; cleared by stop / done
 * Pure, so it is tested in node.
 */

/** Older than this and it no longer rings — it shows as overdue instead. */
export const RING_WINDOW_MS = 12 * 60 * 60_000;

export function alarmRinging(rec, now = Date.now()) {
  if (!rec?.data?.alarm || rec.doneAt || rec.deletedAt || !rec.dueAt) return false;
  if (rec.data.alarmStopped === rec.dueAt) return false;
  const due = Date.parse(rec.dueAt);
  const snoozed = rec.data.alarmSnoozeUntil ? Date.parse(rec.data.alarmSnoozeUntil) : null;
  // A snooze left from an earlier date (a repeat rolled on) doesn't count.
  const at = snoozed != null && snoozed >= due ? snoozed : due;
  return at <= now && now - at < RING_WINDOW_MS;
}

export const stoppedData = (rec) => ({ ...rec.data, alarmStopped: rec.dueAt, alarmSnoozeUntil: null });

export const snoozedData = (rec, minutes, now = Date.now()) =>
  ({ ...rec.data, alarmSnoozeUntil: new Date(now + minutes * 60_000).toISOString() });

/**
 * The phone's Clock app, ready to save an alarm (Android). Chrome may refuse
 * to open it — then it goes to `fallback`, where we say so.
 */
export function clockIntent({ hour, minute, message, fallback }) {
  const msg = encodeURIComponent((message || 'Daybook').slice(0, 60)).replace(/;/g, '%3B');
  return 'intent:#Intent;action=android.intent.action.SET_ALARM;'
    + `i.android.intent.extra.alarm.HOUR=${hour};i.android.intent.extra.alarm.MINUTES=${minute};`
    + `S.android.intent.extra.alarm.MESSAGE=${msg};`
    + `S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}
