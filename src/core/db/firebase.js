/**
 * Firebase, configured at RUNTIME from Settings rather than at build time.
 *
 * The usual Vite pattern bakes VITE_* vars into the bundle, which means every
 * config change needs a rebuild and redeploy. For a personal app you want to
 * paste the config once, in the app, and be done. The config is not secret —
 * a Firebase web config never is. Your security comes entirely from the
 * Firestore rules, which is why the Settings screen hands you the rules to
 * paste alongside the config.
 */
import { initializeApp, getApps, deleteApp } from 'firebase/app';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut as fbSignOut, onAuthStateChanged,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword,
} from 'firebase/auth';
import {
  getFirestore, collection, doc, setDoc, getDocs, deleteDoc, onSnapshot,
  writeBatch, enableIndexedDbPersistence, query, where, orderBy,
} from 'firebase/firestore';

let app = null;
let persistenceAttempted = false;

export function getFirebase(cfg) {
  if (!app) {
    getApps().forEach((a) => { try { deleteApp(a); } catch { /* noop */ } });
    app = initializeApp(cfg);
  }
  return app;
}

export function resetFirebase() {
  getApps().forEach((a) => { try { deleteApp(a); } catch { /* noop */ } });
  app = null;
  persistenceAttempted = false;
}

export const authOf = (cfg) => getAuth(getFirebase(cfg));

/**
 * Firestore can only turn persistence on once, before anything else touches
 * the instance — calling it a second time (now that both the records
 * adapter and Personal Info's security doc both call dbOf) throws
 * SYNCHRONOUSLY, not as a rejected promise, so a bare .catch() on the
 * returned promise doesn't protect against a repeat call. Guard with both a
 * one-time flag and a try/catch around the call itself.
 */
export function dbOf(cfg) {
  const db = getFirestore(getFirebase(cfg));
  if (!persistenceAttempted) {
    persistenceAttempted = true;
    try {
      enableIndexedDbPersistence(db).catch(() => { /* multi-tab or unsupported */ });
    } catch { /* already started elsewhere, or unsupported */ }
  }
  return db;
}

export const signIn = (cfg, email, pw) => signInWithEmailAndPassword(authOf(cfg), email, pw);
export const signUp = (cfg, email, pw) => createUserWithEmailAndPassword(authOf(cfg), email, pw);
export const signOut = (cfg) => fbSignOut(authOf(cfg));
export const watchAuth = (cfg, fn) => onAuthStateChanged(authOf(cfg), fn);

/** A fresh Firebase ID token for whoever's signed in — the one thing a
 *  Cloudflare Pages Function can check to know a request's uid is real,
 *  rather than trusting a uid the client just says it is. Firebase caches
 *  and auto-refreshes the underlying token, so this is cheap to call per
 *  request rather than something to hold onto. */
export async function getIdToken(cfg) {
  const user = authOf(cfg).currentUser;
  if (!user) throw new Error('Not signed in.');
  return user.getIdToken();
}

/** Firebase requires a recent sign-in for sensitive changes like this, hence
 *  the reauth step with the password the user just typed. */
export async function changePassword(cfg, currentPassword, newPassword) {
  const user = authOf(cfg).currentUser;
  if (!user) throw new Error('Not signed in.');
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

/* --------------------------- signed-in devices -------------------------- */

/**
 * Firebase Auth has no concept of "sessions" — every device that signs in
 * with the same email/password gets the same uid, and there is no client-
 * facing way to enumerate or revoke just one of them. This is an honest
 * stand-in built on Firestore: each device writes its own doc here on
 * sign-in and keeps it fresh, and "End"/"Sign out" deletes that doc — which
 * the owning device notices (watchOwnSession) and responds to by signing
 * itself out locally. It's cooperative, not a hard kick: a device that's
 * offline only finds out next time it reconnects, and this never touches
 * the underlying Firebase auth token. For a personal app with no backend,
 * that's the honest amount of "sign out that other device" achievable.
 */
const sessionsCol = (cfg, uid) => collection(dbOf(cfg), 'users', uid, 'sessions');

export async function touchSession(cfg, uid, deviceId, label) {
  await setDoc(doc(sessionsCol(cfg, uid), deviceId), {
    deviceId, label, lastUsedAt: new Date().toISOString(),
  }, { merge: true });
}

export function watchSessions(cfg, uid, onChange) {
  return onSnapshot(sessionsCol(cfg, uid), (snap) => onChange(snap.docs.map((d) => d.data())));
}

/** Fires `onRevoked` once this device's own session doc is deleted from
 *  elsewhere. Caller must await touchSession() before subscribing, so the
 *  first snapshot already reflects the doc this device just wrote — racing
 *  the two would risk reading "doesn't exist yet" as "revoked" and signing
 *  a device out the moment it signs in. */
export function watchOwnSession(cfg, uid, deviceId, onRevoked) {
  return onSnapshot(doc(sessionsCol(cfg, uid), deviceId), (snap) => {
    if (!snap.exists()) onRevoked();
  });
}

export async function endSession(cfg, uid, deviceId) {
  await deleteDoc(doc(sessionsCol(cfg, uid), deviceId));
}

/* --------------------------- the adapter ------------------------------- */

/**
 * Firestore adapter, built around read cost.
 *
 * Firestore bills per DOCUMENT READ. The naive design — listen to the
 * collection and re-fetch it whenever anything changes — costs a full
 * collection read per edit. With a couple of thousand staff in Directory that
 * is ~2,000 reads to change one phone number, and the 50,000/day free tier is
 * gone before lunch.
 *
 * So this adapter never reads the whole collection except once, ever:
 *
 *   - the caller keeps a local mirror of every record and searches that;
 *   - syncing asks only for documents whose updatedAt is newer than the last
 *     sync, which is normally a handful and often zero;
 *   - writes go straight up, because writes are cheap and infrequent.
 *
 * Steady-state cost of using the app all day is close to nothing.
 */
export function createFirestoreAdapter(cfg, uid) {
  const db = dbOf(cfg);
  const col = collection(db, 'users', uid, 'records');

  /* NO overlap window, deliberately.
   *
   * The obvious guard against clock skew is to re-ask for the last N seconds
   * on every sync. It backfires twice: an idle app re-reads the same tail
   * forever (200 quiet syncs × 30 records = 6,000 reads for nothing), and a
   * fast bulk import lands entirely inside the window so you pay to read your
   * own import back.
   *
   * Skew is handled instead by a periodic full reconcile — see RECONCILE_DAYS
   * in repo.jsx. One full read a month is far cheaper than a permanent tax on
   * every sync, and it catches anything a delta could ever miss. */

  /* NO { merge: true } on writes, deliberately.
   *
   * Firestore's merge deep-merges nested maps: it adds and updates keys, but
   * it can never REMOVE one. Several record types keep a map keyed by
   * something meaningful — overtime.config's `holidays` (keyed by date), a
   * day's `appr` (keyed by entry id) — and deleting an entry there means
   * dropping a key. Under merge that deletion reached the local mirror but
   * never the cloud, so the next sync faithfully restored the key and the
   * deleted item reappeared seconds later. (This is why holiday delete
   * failed only when signed in: the local adapter replaces the whole record,
   * so it never had the bug.)
   *
   * A record is always written whole — `write`/`bulkWrite` in repo.jsx pass
   * a complete object built by makeRecord — so a plain set is both correct
   * and what the local adapter already does. */
  return {
    async put(record) {
      await setDoc(doc(col, record.id), record);
      return record;
    },

    async remove(id) { await deleteDoc(doc(col, id)); },

    /** Full read. Called once on first connect, and never again. */
    async all() {
      const snap = await getDocs(col);
      return { records: snap.docs.map((d) => d.data()), reads: snap.size };
    },

    /**
     * Everything changed since `sinceIso`. This is the call that runs day to
     * day, and it usually returns nothing.
     */
    async pullSince(sinceIso) {
      if (!sinceIso) return this.all();
      const q = query(col, where('updatedAt', '>', sinceIso), orderBy('updatedAt'));
      const snap = await getDocs(q);
      return { records: snap.docs.map((d) => d.data()), reads: snap.size };
    },

    /**
     * Live mode. Uses docChanges() so only the documents that actually
     * changed are delivered and billed — never the whole collection.
     */
    subscribeSince(sinceIso, onChange, onError) {
      const from = sinceIso || new Date(0).toISOString();
      const q = query(col, where('updatedAt', '>', from), orderBy('updatedAt'));
      return onSnapshot(
        q,
        (snap) => {
          const changed = snap.docChanges()
            .filter((c) => c.type !== 'removed')
            .map((c) => c.doc.data());
          if (changed.length) onChange(changed, changed.length);
        },
        (e) => onError?.(e)
      );
    },

    async bulkPut(records) {
      for (let i = 0; i < records.length; i += 400) {
        const batch = writeBatch(db);
        // Whole-record set, not a merge — see the note on put() above.
        records.slice(i, i + 400).forEach((r) => batch.set(doc(col, r.id), r));
        await batch.commit();
      }
      return records.length;
    },
  };
}
