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

  return {
    async put(record) {
      await setDoc(doc(col, record.id), record, { merge: true });
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
        records.slice(i, i + 400).forEach((r) => batch.set(doc(col, r.id), r, { merge: true }));
        await batch.commit();
      }
      return records.length;
    },
  };
}
