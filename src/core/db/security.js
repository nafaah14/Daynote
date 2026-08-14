/**
 * users/{uid}/security/main — one fixed document, not the records collection.
 * Holds only the PIN salt + verifier (never the PIN or the derived key) plus
 * whether biometric unlock is enrolled on some device.
 *
 * Kept separate from repo.jsx's records adapter: this doc isn't part of the
 * record envelope (no type/title/tags/etc.), it's account-level like auth
 * itself. Callers should dynamically import this alongside ./firebase, same
 * as repo.jsx does, so the Firestore SDK still isn't bundled for local-only use.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { dbOf } from './firebase';

const securityDoc = (db, uid) => doc(db, 'users', uid, 'security', 'main');

export async function getSecurityDoc(cfg, uid) {
  const snap = await getDoc(securityDoc(dbOf(cfg), uid));
  return snap.exists() ? snap.data() : null;
}

export async function setSecurityDoc(cfg, uid, data) {
  await setDoc(securityDoc(dbOf(cfg), uid), data, { merge: true });
}
