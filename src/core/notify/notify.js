/**
 * In-app notifications.
 *
 * Separate from push on purpose. Push is best-effort and can silently fail —
 * permissions denied, iOS not installed, phone offline. This feed is the
 * reliable one: whatever happened while you were away is here when you open
 * the app, whether or not a push ever made it to your lock screen.
 *
 * Events are ordinary records, so they sync, survive reloads, and are
 * searchable like anything else.
 */

export const NOTIFY_TYPE = 'notify.event';

/**
 * data: { kind, body, url, readAt, dedupeKey }
 *   kind      — 'reminder' | 'alert' | 'system' | 'info', drives the icon
 *   dedupeKey — stops the same event being raised twice on every app open
 */

/**
 * Show the event on the device's own notification shade.
 *
 * This is not push — it needs the app to be running or recently backgrounded.
 * But it costs nothing, needs no server, and covers the common case of a
 * reminder coming due while you have the app open, which is otherwise silent.
 * Real push for a closed app still needs the scheduled function.
 */
async function showLocally({ title, body, url }) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.ready;
    if (!reg) return;
    await reg.showNotification(title, {
      body,
      tag: url || title,
      data: { url: url || '/' },
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    });
  } catch { /* never let a notification failure break the app */ }
}

export function pushEvent(repo, { title, body = '', url = null, kind = 'info', dedupeKey = null }) {
  if (dedupeKey) {
    const existing = repo
      .query({ type: NOTIFY_TYPE })
      .find((e) => e.data.dedupeKey === dedupeKey);
    if (existing) return existing;
  }
  const rec = repo.create(NOTIFY_TYPE, {
    title,
    data: { kind, body, url, readAt: null, dedupeKey },
  });
  // only for genuinely new events — the dedupe check above already returned
  if (kind === 'reminder' || kind === 'alert') showLocally({ title, body, url });
  return rec;
}

export const allEvents = (repo) =>
  repo.query({ type: NOTIFY_TYPE })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const unreadEvents = (repo) => allEvents(repo).filter((e) => !e.data.readAt);

export const markRead = (repo, id) => {
  const e = repo.get(id);
  if (e && !e.data.readAt) repo.update(id, { data: { ...e.data, readAt: new Date().toISOString() } });
};

/**
 * "Clear" marks read — it does not delete. The badge goes quiet but the
 * history stays, which is the whole point of keeping a feed.
 */
export const markAllRead = (repo) => {
  const now = new Date().toISOString();
  unreadEvents(repo).forEach((e) => repo.update(e.id, { data: { ...e.data, readAt: now } }));
};

/** Trim the archive so it can't grow without bound. */
export function pruneEvents(repo, keep = 200) {
  const all = allEvents(repo);
  all.slice(keep).forEach((e) => repo.softDelete(e.id));
}

/**
 * Ask every module what deserves a notification right now.
 *
 * Modules opt in with `raiseEvents({ repo }) => [{...}]` on their manifest —
 * the same shape as today() and search(). Core stays ignorant of what a
 * reminder or a breakdown is.
 */
export function collectEvents(repo, modules) {
  modules.forEach((m) => {
    if (typeof m.raiseEvents !== 'function') return;
    try {
      (m.raiseEvents({ repo }) || []).forEach((e) => pushEvent(repo, e));
    } catch {
      /* a broken module must not take the whole feed down */
    }
  });
}
