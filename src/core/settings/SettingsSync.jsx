import { useEffect, useRef } from 'react';
import { useRepo } from '../db/repo';
import { useSettings, SHARED_KEYS } from './settings';

/**
 * Keeps the settings that should follow your login — theme, bottom bar,
 * drawer order, morning brief — in one hidden record, so every device
 * signed in to the same account arranges itself the same way.
 *
 * Settings still live in localStorage first (they're needed before the repo
 * has loaded); this only mirrors them. On start the synced copy wins, so a
 * device that's been away doesn't push stale choices over newer ones. After
 * that, whichever side changed last is copied to the other. Push
 * subscriptions stay per device — they belong to this browser, not to you.
 */
export const SETTINGS_TYPE = 'system.settings';

const pick = (o = {}) => Object.fromEntries(SHARED_KEYS.filter((k) => k in o).map((k) => [k, o[k]]));
const key = (o) => JSON.stringify(SHARED_KEYS.map((k) => o?.[k] ?? null));

export default function SettingsSync() {
  const repo = useRepo();
  const settings = useSettings();
  const ready = useRef(false);
  const lastLocal = useRef(null);  // what we last wrote or adopted
  const lastRemote = useRef(null); // the synced copy we last acted on

  useEffect(() => {
    if (repo.loading) return;
    // Two devices that hadn't synced yet can each make one; the oldest is
    // the real one, and the spare is removed once both are seen.
    const [rec, ...spare] = repo.query({ type: SETTINGS_TYPE })
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    spare.forEach((r) => repo.softDelete(r.id));
    const local = pick(settings);
    const localKey = key(local);
    const remote = rec ? pick(rec.data?.shared) : null;
    const remoteKey = remote ? key(remote) : null;

    const adopt = () => {
      lastRemote.current = remoteKey;
      lastLocal.current = remoteKey;
      if (remoteKey !== localKey) settings.applyShared(remote);
    };
    const write = () => {
      lastLocal.current = localKey;
      lastRemote.current = localKey;
      if (rec) repo.update(rec.id, { data: { ...rec.data, shared: local } });
      else repo.create(SETTINGS_TYPE, { title: 'App settings', home: 'hidden', data: { shared: local } });
    };

    if (!ready.current) {
      ready.current = true;
      if (rec) adopt(); else write();
      return;
    }
    if (rec && remoteKey !== lastRemote.current) adopt();
    else if (localKey !== lastLocal.current) write();
  }, [repo, settings]);

  return null;
}
