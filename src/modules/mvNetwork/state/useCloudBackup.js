import { useCallback, useEffect, useRef, useState } from 'react';
import { loadConfig } from '../../../core/db/config';
import { migrate } from '../lib/electricalModel';

const LAST_BACKUP_KEY = 'daybook.mvNetwork.lastBackupAt';

/**
 * Firebase (~650KB) is dynamically imported here, exactly like repo.jsx and
 * Settings.jsx already do — a static import would pull the whole SDK into
 * the main bundle for every visitor, cloud user or not. Confirmed against
 * a production build: a static import here merged the separate ~630KB
 * firebase chunk straight into the main bundle.
 */
async function loadFirestore(uid) {
  const cfg = loadConfig();
  if (!cfg) throw new Error('Cloud sync is not configured (Settings → Cloud sync).');
  const [{ dbOf }, { doc, getDoc, setDoc }] = await Promise.all([
    import('../../../core/db/firebase'),
    import('firebase/firestore'),
  ]);
  const ref = doc(dbOf(cfg), 'users', uid, 'mvNetwork', 'network');
  return { ref, getDoc, setDoc };
}

/** Firestore rejects arrays that directly contain other arrays — a cable's
 *  `points` is `[[lat,lng], ...]`, so cables travel as one JSON string field.
 *  Everything else (nodes, feeders, areas) has no nested-array shape and
 *  goes across natively. */
function toFirestorePayload(net) {
  const { cables, ...rest } = net;
  return { ...rest, cablesJson: JSON.stringify(cables || []), updatedAt: new Date().toISOString() };
}
function fromFirestorePayload(data) {
  const { cablesJson, ...rest } = data;
  return migrate({ ...rest, cables: JSON.parse(cablesJson || '[]') });
}

const isEmptyNetwork = (net) => !net.nodes.length && !net.cables.length && !net.feeders.length;

/**
 * Local-first, backup-on-demand cloud sync for the network document.
 * No listeners, no live sync: writes happen only on explicit "Backup now"
 * or ~60s after the last change (debounced, collapsed into one write), and
 * reads happen only on explicit "Restore latest" — or once, automatically,
 * when this device's local network is still empty (the "opening on a
 * different device" case). Cost is a flat 1 read / 1 write per save no
 * matter how large the network gets, since it's a single document.
 */
export function useCloudBackup(net, { cloud, uid }, onRestore) {
  const [lastBackupAt, setLastBackupAt] = useState(() => localStorage.getItem(LAST_BACKUP_KEY));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const netRef = useRef(net);
  netRef.current = net;
  const debounceRef = useRef(null);
  const mountedOnceRef = useRef(false);
  const autoRestoreTriedRef = useRef(false);

  const backupNow = useCallback(async () => {
    if (!cloud || !uid) throw new Error('Sign in to the cloud first (Settings → Cloud sync).');
    setBusy(true); setError(null);
    try {
      const { ref, setDoc } = await loadFirestore(uid);
      await setDoc(ref, toFirestorePayload(netRef.current));
      const now = new Date().toISOString();
      localStorage.setItem(LAST_BACKUP_KEY, now);
      setLastBackupAt(now);
    } catch (e) {
      setError(e?.message || 'Backup failed');
      throw e;
    } finally {
      setBusy(false);
    }
  }, [cloud, uid]);

  const restoreLatest = useCallback(async () => {
    if (!cloud || !uid) throw new Error('Sign in to the cloud first (Settings → Cloud sync).');
    setBusy(true); setError(null);
    try {
      const { ref, getDoc } = await loadFirestore(uid);
      const snap = await getDoc(ref);
      return snap.exists() ? fromFirestorePayload(snap.data()) : null;
    } catch (e) {
      setError(e?.message || 'Restore failed');
      throw e;
    } finally {
      setBusy(false);
    }
  }, [cloud, uid]);

  // Debounced auto-backup — skips the very first mount so just opening the
  // app doesn't itself count as a change worth backing up.
  useEffect(() => {
    if (!cloud || !uid) return undefined;
    if (!mountedOnceRef.current) { mountedOnceRef.current = true; return undefined; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { backupNow().catch(() => {}); }, 60_000);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net, cloud, uid]);

  // Auto-restore, once, only when this device's local network is empty.
  useEffect(() => {
    if (!cloud || !uid || autoRestoreTriedRef.current || !isEmptyNetwork(netRef.current)) return;
    autoRestoreTriedRef.current = true;
    restoreLatest().then((incoming) => { if (incoming) onRestore(incoming); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, uid]);

  return { lastBackupAt, busy, error, backupNow, restoreLatest };
}
