/**
 * A local mirror of whatever is in the cloud.
 *
 * This is what makes the app cheap to run. Every record you've ever synced is
 * kept here, so:
 *
 *   - opening the app reads from disk, not from Firestore — zero reads;
 *   - search and every module query run against memory, so typing costs
 *     nothing no matter how large Directory gets;
 *   - syncing only has to ask for what changed since last time.
 *
 * Without this, the app would have to re-read the collection to know anything,
 * which is exactly the trap that makes Firestore bills surprising.
 */

const key = (uid) => `daybook.mirror.${uid}`;
const metaKey = (uid) => `daybook.mirror.meta.${uid}`;
const LAST_UID_KEY = 'daybook.lastUid';

/**
 * Which account's mirror to read BEFORE auth has resolved.
 *
 * Firebase Auth takes real time to confirm a persisted session — it has to
 * read IndexedDB, and on a cold load it has to wait for the SDK's own chunk
 * to finish downloading first. None of that should block showing what's
 * already on disk. Remembering the uid from last time lets the very first
 * render read the right mirror instantly; auth resolving afterwards just
 * confirms it and syncs deltas in the background.
 */
export const loadLastUid = () => {
  try { return localStorage.getItem(LAST_UID_KEY); } catch { return null; }
};
export const saveLastUid = (uid) => {
  try { if (uid) localStorage.setItem(LAST_UID_KEY, uid); } catch { /* ignore */ }
};
export const clearLastUid = () => {
  try { localStorage.removeItem(LAST_UID_KEY); } catch { /* ignore */ }
};

export function loadMirror(uid) {
  try {
    const raw = localStorage.getItem(key(uid));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveMirror(uid, records) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(records));
    return true;
  } catch {
    // quota: a few thousand records is well under the limit, but if it ever
    // blows we degrade to "read on open" rather than losing anything
    return false;
  }
}

export function loadMeta(uid) {
  try {
    return JSON.parse(localStorage.getItem(metaKey(uid)) || '{}');
  } catch { return {}; }
}

export function saveMeta(uid, patch) {
  const next = { ...loadMeta(uid), ...patch };
  localStorage.setItem(metaKey(uid), JSON.stringify(next));
  return next;
}

export function clearMirror(uid) {
  localStorage.removeItem(key(uid));
  localStorage.removeItem(metaKey(uid));
}

/** Merge incoming records over the mirror, newest updatedAt wins. */
export function mergeRecords(existing, incoming) {
  const byId = new Map(existing.map((r) => [r.id, r]));
  let changed = 0;
  incoming.forEach((r) => {
    const cur = byId.get(r.id);
    if (!cur || (r.updatedAt || '') >= (cur.updatedAt || '')) {
      byId.set(r.id, r);
      changed++;
    }
  });
  return { records: [...byId.values()], changed };
}
