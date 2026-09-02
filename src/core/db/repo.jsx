import {
  createContext, useContext, useEffect, useMemo, useState, useCallback, useRef,
} from 'react';
import { createLocalAdapter } from './adapter-local';
import { loadConfig, loadSyncMode } from './config';
import { loadMirror, saveMirror, loadMeta, saveMeta, mergeRecords, loadLastUid, saveLastUid } from './mirror';
import { makeRecord, migrate } from './schema';
import { getDeviceId, deviceLabel } from './deviceId';

/**
 * The repo. Modules see create/update/query/get/softDelete and nothing else.
 *
 * READ COST IS THE WHOLE DESIGN HERE. Firestore bills per document read, so
 * this never re-reads the collection to find out what changed. Instead it
 * keeps a local mirror of everything, searches that, and asks the cloud only
 * for records with a newer updatedAt than the last sync.
 *
 * Practically: opening the app costs nothing, searching costs nothing, and a
 * sync usually reads zero documents because nothing changed.
 */
/**
 * Deltas can in principle miss a record if two devices' clocks disagree, since
 * updatedAt is written client-side. Rather than tax every sync with an overlap
 * window, we do one full read occasionally. At a few thousand records that is
 * a rounding error against the 50,000/day free tier, and it repairs anything a
 * delta could have dropped.
 */
const RECONCILE_DAYS = 30;

const RepoCtx = createContext(null);

export function RepoProvider({ children }) {
  const cfg = useMemo(() => loadConfig(), []);
  const [syncMode, setSyncModeState] = useState(() => loadSyncMode());
  const [uid, setUid] = useState(cfg ? undefined : null);
  const [cloudAdapter, setCloudAdapter] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [meta, setMeta] = useState({});
  const [pending, setPending] = useState(0);

  /**
   * The whole point of the mirror. Firebase Auth confirming a persisted
   * session takes real time — a dynamic import of its SDK on a cold load,
   * then an IndexedDB read — and none of that should hold up showing what's
   * already on disk from last time. Guess which account by what was cached
   * last session, and paint from that mirror on the very first render.
   *
   * If a different account signs in, or this account signs out, the effects
   * below correct the guess once auth actually resolves; the common case of
   * reopening the same account gets to skip the wait entirely.
   */
  const cachedUid = useMemo(() => loadLastUid(), []);
  const [records, setRecords] = useState(() => {
    if (!cachedUid) return null;
    const mirrored = loadMirror(cachedUid);
    return mirrored ? mirrored.map(migrate) : null;
  });

  const localAdapter = useMemo(() => createLocalAdapter(), []);
  const recordsRef = useRef([]);
  // Incremented on every local write; lets an in-flight read detect that it
  // resolved too late to be applied safely (see the local-mode effect).
  const writeSeqRef = useRef(0);
  // The uid the cloud-mode effect last painted `records` from the mirror
  // for — see that effect for why re-running it must not repaint blindly.
  const paintedUidRef = useRef(undefined);
  recordsRef.current = records || [];

  /* ---------------------------- auth ---------------------------------- */
  useEffect(() => {
    if (!cfg) return;
    let stop = () => {};
    let stopSession = () => {};
    let alive = true;
    import('./firebase').then((fb) => {
      if (!alive) return;
      try {
        stop = fb.watchAuth(cfg, (user) => {
          if (!alive) return;
          setUid(user ? user.uid : null);
          setCloudAdapter(user ? fb.createFirestoreAdapter(cfg, user.uid) : null);
          stopSession();
          stopSession = () => {};
          if (user) {
            saveLastUid(user.uid);
            // Registers this device on Settings' Security & devices list, and
            // watches for another device ending this one — see firebase.js's
            // touchSession/watchOwnSession for why the await matters here.
            const deviceId = getDeviceId();
            fb.touchSession(cfg, user.uid, deviceId, deviceLabel())
              .then(() => {
                if (!alive) return;
                stopSession = fb.watchOwnSession(cfg, user.uid, deviceId, () => {
                  fb.signOut(cfg).catch(() => {});
                });
              })
              .catch(() => {});
          }
        });
      } catch { setUid(null); }
    }).catch(() => setUid(null));
    return () => { alive = false; stop(); stopSession(); };
  }, [cfg]);

  const cloud = !!cfg && !!uid && !!cloudAdapter;

  /* ------------------------- loading records --------------------------- */

  // LOCAL MODE — straight from localStorage. Only once auth has genuinely
  // resolved to "no user" (or there's no cloud project at all) — never while
  // uid is still undefined, or this would blank out the cached cloud records
  // painted on first render before auth has had a chance to confirm them.
  useEffect(() => {
    if (cloud || uid === undefined) return;
    let alive = true;
    /**
     * Reading is async, and applying the result REPLACES every record. So a
     * read that started before a local edit will, on resolving, wipe that
     * edit out — the UI shows the change, then it reverts a moment later and
     * is back on the next load. (This is what made holiday delete and edit
     * look broken; in development Vite's hot reload re-runs this effect
     * constantly, so the window is hit often.)
     *
     * Guard by noting the write counter before the read and discarding the
     * result if a write landed meanwhile — that write's own notify() brings
     * a fresh read along right behind it.
     */
    const load = async () => {
      const seq = writeSeqRef.current;
      const all = await localAdapter.all();
      if (!alive || writeSeqRef.current !== seq) return;
      setRecords(all.map(migrate));
    };
    load();
    const un = localAdapter.subscribe(load);
    return () => { alive = false; un(); };
  }, [cloud, uid, localAdapter]);

  // CLOUD MODE — mirror first (free), then sync according to the mode.
  useEffect(() => {
    if (!cloud) return;
    let alive = true;

    const mirrored = loadMirror(uid);
    const m = loadMeta(uid);
    setMeta(m);

    /**
     * This effect re-runs whenever `cloudAdapter` gets a new object identity
     * — which `watchAuth`'s callback does on every call, including a
     * re-emission of the SAME signed-in user (Firebase Auth persistence can
     * do this: token refresh, multiple tabs, coming back from background).
     * Painting from the mirror unconditionally on every run means a write
     * made in the gap since the last paint — an edit whose `saveMirror` call
     * (in `echo`) hasn't necessarily beaten a re-run here — gets silently
     * replaced by the older snapshot still on disk. Same defect as the
     * local-mode read race this file already guards against.
     *
     * The genuine first paint for this uid already happened synchronously in
     * the `records` useState initializer above (or this is a different uid
     * signing in, which legitimately needs to load its own data) — so only
     * repaint from the mirror when the uid actually changed.
     */
    if (paintedUidRef.current !== uid) {
      paintedUidRef.current = uid;
      if (mirrored) setRecords(mirrored.map(migrate));
    }

    // A device that has never synced must do one full read; there is no way
    // around that and it happens exactly once per device.
    const firstEver = !mirrored || !m.watermark;

    if (firstEver || syncMode === 'open' || syncMode === 'live') {
      pull({ silent: !firstEver });
    } else if (!mirrored) {
      setRecords([]);
    }

    // Live mode only: deltas, never the whole collection.
    let stop = () => {};
    if (syncMode === 'live') {
      stop = cloudAdapter.subscribeSince(
        loadMeta(uid).watermark,
        (changed, reads) => {
          if (!alive) return;
          applyIncoming(changed, reads);
        },
        (e) => alive && setSyncError(e?.message || 'Live sync dropped.')
      );
    }
    return () => { alive = false; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, uid, cloudAdapter, syncMode]);

  /* ---------------------------- syncing -------------------------------- */

  /**
   * The watermark is the newest updatedAt we have actually SEEN — never wall
   * clock. Using "now" would make the overlap window re-read everything
   * written in the seconds before a sync, which after a bulk import means
   * paying to read the entire import straight back.
   */
  const bumpWatermark = useCallback((candidates) => {
    const cur = loadMeta(uid).watermark || '';
    const top = candidates.reduce((m, r) => ((r.updatedAt || '') > m ? r.updatedAt : m), cur);
    return top;
  }, [uid]);

  const applyIncoming = useCallback((incoming, reads, { full } = {}) => {
    const mapped = incoming.map(migrate);
    const merged = mergeRecords(recordsRef.current, mapped);
    setRecords(merged.records);
    saveMirror(uid, merged.records);
    const nowIso = new Date().toISOString();
    const next = saveMeta(uid, {
      watermark: bumpWatermark(mapped),
      lastSyncedAt: nowIso,
      lastReads: reads,
      totalReads: (loadMeta(uid).totalReads || 0) + reads,
      ...(full ? { lastFullSyncAt: nowIso } : {}),
    });
    setMeta(next);
    setPending(0);
    return merged.changed;
  }, [uid, bumpWatermark]);

  const pull = useCallback(async ({ silent } = {}) => {
    if (!cloudAdapter) return 0;
    if (!silent) setSyncing(true);
    try {
      const m = loadMeta(uid);
      const dueForFull = !m.lastFullSyncAt
        || (Date.now() - Date.parse(m.lastFullSyncAt)) > RECONCILE_DAYS * 864e5;
      const since = dueForFull ? null : m.watermark;

      const { records: got, reads } = await cloudAdapter.pullSince(since);
      applyIncoming(got, reads, { full: dueForFull });
      setSyncError(null);
      return got.length;
    } catch (e) {
      setSyncError(e?.message || 'Sync failed.');
      throw e;
    } finally {
      setSyncing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudAdapter, uid, applyIncoming]);

  /* ---------------------------- writing -------------------------------- */

  const echo = useCallback((rec) => {
    // Counts local writes so an already-in-flight read can tell that it is
    // now stale — see the local-mode effect, where replacing state with a
    // read that started before this write silently undoes the edit.
    writeSeqRef.current += 1;
    setRecords((cur) => {
      const base = cur || [];
      const i = base.findIndex((r) => r.id === rec.id);
      const next = i === -1 ? [...base, rec] : base.map((r) => (r.id === rec.id ? rec : r));
      if (uid) saveMirror(uid, next);
      return next;
    });
  }, [uid]);

  /**
   * Known corner case, not introduced by this change: a write made in the
   * brief window after paint but before auth confirms (uid still undefined)
   * lands on localAdapter, since `cloud` is false until a real uid exists.
   * On a warm cache that window is milliseconds; on a cold one — first load
   * after a deploy, slow connection — it could be a second or two. Rare
   * enough for a single-user app that an outbox to cover it isn't worth the
   * complexity, but worth knowing if a write ever seems to go missing from
   * the cloud copy right after opening the app on a fresh cache.
   */
  const adapter = cloud ? cloudAdapter : localAdapter;

  const api = useMemo(() => {
    /**
     * Writes always go straight up, even in manual mode. Writes are cheap
     * (20,000/day free) and you make a few dozen a day, so queueing them
     * would add an outbox and conflict handling to save nothing. Reads are
     * the expensive side, and that's what the modes control.
     */
    const write = (rec) => {
      adapter.put(rec).then(
        () => {
          setSyncError(null);
          if (cloud) {
            setPending((n) => n + 1);
            // We wrote it, so we already have it. Advancing past our own
            // write stops the next sync paying to read it back.
            const cur = loadMeta(uid).watermark || '';
            if ((rec.updatedAt || '') > cur) setMeta(saveMeta(uid, { watermark: rec.updatedAt }));
          }
        },
        (e) => setSyncError(e?.message || 'Could not save to the cloud.')
      );
      return rec;
    };

    const update = (id, patch) => {
      const existing = recordsRef.current.find((r) => r.id === id);
      if (!existing) {
        // Returning null silently here means an edit can vanish with no
        // sign anywhere — the UI updates from React state, the write never
        // happens, and the change reappears on the next load. Whatever put
        // us here (a stale id, a remount mid-edit) is a bug worth seeing.
        console.warn(`[repo] update skipped: no record ${id} in memory — the edit was NOT saved.`);
        return null;
      }
      const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      echo(next);
      return write(next);
    };

    return {
      /**
       * True only when there is genuinely nothing to show yet — never merely
       * "auth hasn't confirmed." Cached records from last session satisfy
       * this immediately; auth and sync then true things up quietly behind
       * whatever's already on screen.
       */
      loading: records === null,
      all: records || [],
      syncError,
      syncing,
      cloud,
      uid: uid || null,
      configured: !!cfg,
      syncMode,
      lastSyncedAt: meta.lastSyncedAt || null,
      lastReads: meta.lastReads ?? null,
      totalReads: meta.totalReads || 0,
      pendingWrites: pending,

      setSyncMode(mode) {
        localStorage.setItem('daybook.syncMode', mode);
        setSyncModeState(mode);
      },

      syncNow: () => pull(),

      create(type, fields) {
        const rec = makeRecord(type, fields);
        echo(rec);
        return write(rec);
      },

      update,

      softDelete(id) {
        return update(id, { deletedAt: new Date().toISOString() });
      },

      restore(id) {
        return update(id, { deletedAt: null });
      },

      /**
       * Items in the trash: deleted within the last `days` days. Older items
       * stay soft-deleted (invisible everywhere) but aren't shown in the
       * trash either — effectively purged without a real delete write.
       */
      queryTrash(days = 5) {
        const cutoff = new Date(Date.now() - days * 864e5).toISOString();
        return (records || [])
          .filter((r) => r.deletedAt && r.deletedAt >= cutoff)
          .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
      },

      get(id) {
        return recordsRef.current.find((r) => r.id === id) || null;
      },

      /**
       * Runs entirely against the in-memory mirror — no network, no reads,
       * no cost. This is why searching Directory is free however big it gets.
       */
      query(opts = {}) {
        let out = (records || []).filter((r) => !r.deletedAt);
        if (opts.type) out = out.filter((r) => r.type === opts.type);
        if (opts.typePrefix) out = out.filter((r) => r.type.startsWith(opts.typePrefix));
        if (opts.tag) out = out.filter((r) => r.tags.includes(opts.tag));
        if (opts.dueBefore) out = out.filter((r) => r.dueAt && r.dueAt <= opts.dueBefore);
        if (opts.done === true) out = out.filter((r) => r.doneAt);
        if (opts.done === false) out = out.filter((r) => !r.doneAt);
        if (opts.linkedTo) out = out.filter((r) => r.links.some((l) => l.id === opts.linkedTo));
        return out.sort((a, b) => (a.dueAt || a.createdAt).localeCompare(b.dueAt || b.createdAt));
      },

      /** Build a record without writing it — for assembling a bulkWrite. */
      draft(type, fields) {
        return makeRecord(type, fields);
      },

      /**
       * Write many at once: one batch on Firestore, one store write locally.
       * Anything importing more than a handful must use this.
       */
      async bulkWrite(list) {
        if (!list.length) return 0;
        try {
          if (adapter.bulkPut) await adapter.bulkPut(list);
          else for (const r of list) await adapter.put(r);
          const merged = mergeRecords(recordsRef.current, list);
          setRecords(merged.records);
          if (uid) saveMirror(uid, merged.records);
          if (cloud) {
            setPending((n) => n + list.length);
            // Same reasoning as single writes, and it matters far more here:
            // without this, syncing after importing 1,900 staff would read
            // all 1,900 straight back.
            setMeta(saveMeta(uid, { watermark: bumpWatermark(list) }));
          }
          setSyncError(null);
          return list.length;
        } catch (e) {
          setSyncError(e?.message || 'Bulk write failed.');
          throw e;
        }
      },

      async uploadLocalToCloud() {
        if (!cloud) throw new Error('Sign in to the cloud first.');
        const local = await localAdapter.all();
        if (!local.length) return 0;
        const mapped = local.map(migrate);
        await adapter.bulkPut(mapped);
        const merged = mergeRecords(recordsRef.current, mapped);
        setRecords(merged.records);
        saveMirror(uid, merged.records);
        setMeta(saveMeta(uid, {
          watermark: bumpWatermark(mapped),
          lastSyncedAt: new Date().toISOString(),
        }));
        return local.length;
      },
    };
  }, [records, adapter, echo, cloud, uid, cfg, localAdapter, syncError, syncing,
      syncMode, meta, pending, pull, bumpWatermark]);

  return <RepoCtx.Provider value={api}>{children}</RepoCtx.Provider>;
}

export const useRepo = () => {
  const ctx = useContext(RepoCtx);
  if (!ctx) throw new Error('useRepo must be used inside RepoProvider');
  return ctx;
};
