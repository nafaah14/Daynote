/**
 * Device-local storage for the biometric-wrapped Personal Info key. Never
 * synced to Firestore — a device that hasn't registered a fingerprint has no
 * way to read this, PIN-only or not. Native indexedDB (no idb dependency),
 * matching this project's native-API-first crypto approach.
 *
 * Record shape per uid: { credentialId, encrypted, iv } — the wrapped AES
 * key, keyed by uid so switching accounts on the same device doesn't collide.
 */
const DB_NAME = 'daybook-personalinfo';
const STORE = 'biometricKeys';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBiometricRecord(uid, record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, uid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadBiometricRecord(uid) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(uid);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearBiometricRecord(uid) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(uid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
