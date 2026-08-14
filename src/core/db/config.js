/**
 * Firebase CONFIG only — deliberately free of any SDK import.
 *
 * The SDK is ~650KB. Loading it for someone who never turns on cloud sync
 * would triple the bundle for no reason, so this file stays pure and the real
 * SDK is dynamically imported from ./firebase.js only once a config exists.
 */
export const CONFIG_KEY = 'daybook.firebase.config.v1';

/**
 * Built-in project. Saves pasting the config on every device you install on.
 *
 * A Firebase web config is not a secret — it ships in the JavaScript of every
 * Firebase app there is. What actually protects the data is the Firestore
 * rules (which scope every document to its owner's uid) plus which sign-in
 * methods the project allows. Anything saved in Settings overrides this.
 *
 * ── IF A HOST'S SECRET SCANNER REFUSES TO BUILD ──────────────────────────
 * Set this to null. The app then starts with no project configured and asks
 * for the config in Settings → Cloud sync, which is stored per device and
 * only has to be done once. Nothing else changes; every code path already
 * handles an unconfigured start, because that was the original design.
 *
 *     export const DEFAULT_CONFIG = null;
 * ─────────────────────────────────────────────────────────────────────────
 */
export const DEFAULT_CONFIG = {
  apiKey: 'AIzaSyD0itRlqDKDhhz2hZmubIlRA0dXl68CQM8',
  authDomain: 'personal-assisstant-1f2cc.firebaseapp.com',
  projectId: 'personal-assisstant-1f2cc',
  storageBucket: 'personal-assisstant-1f2cc.firebasestorage.app',
  messagingSenderId: '1090622378212',
  appId: '1:1090622378212:web:269575873f02bcbf261cf1',
};

/** Saved config wins; otherwise fall back to the built-in project. */
export function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to the default */ }
  return DEFAULT_CONFIG;
}

/** True when this device is using a config you pasted, not the built-in one. */
export function isCustomConfig() {
  try { return !!localStorage.getItem(CONFIG_KEY); } catch { return false; }
}

export function saveConfig(cfg) {
  if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(CONFIG_KEY);
}

/**
 * Accepts either a JSON object or the whole `const firebaseConfig = {...}`
 * snippet you get from the Firebase console, because pasting the snippet is
 * what people actually do.
 */
export function parseConfig(text) {
  const t = text.trim();
  if (!t) throw new Error('Paste your Firebase config first.');
  let obj;
  try {
    obj = JSON.parse(t);
  } catch {
    const braces = t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1);
    if (!braces) throw new Error("That doesn't look like a Firebase config.");
    // quote bare keys, drop trailing commas, normalise quotes
    const json = braces
      .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,(\s*[}\]])/g, '$1');
    try { obj = JSON.parse(json); }
    catch { throw new Error("Couldn't read that config. Paste the object from the Firebase console."); }
  }
  const need = ['apiKey', 'projectId', 'appId'];
  const missing = need.filter((k) => !obj[k]);
  if (missing.length) throw new Error(`Config is missing: ${missing.join(', ')}`);
  return obj;
}


export const FIRESTORE_RULES = `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Your records. Nobody but you can read or write them.
    match /users/{uid}/records/{recordId} {
      allow read, delete: if request.auth != null && request.auth.uid == uid;

      allow create, update: if request.auth != null
        && request.auth.uid == uid
        && request.resource.data.keys().hasAll(['id', 'type'])
        && request.resource.data.id is string
        && request.resource.data.type is string
        && request.resource.data.type.size() < 64
        && request.resource.data.size() < 20;
    }

    // Push subscriptions, if you switch scheduled notifications on later.
    match /users/{uid}/pushSubscriptions/{subId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // Personal Info PIN — salt + verifier only. Never the PIN, never the
    // derived key. A single fixed doc, not a collection.
    match /users/{uid}/security/main {
      allow read, write: if request.auth != null
        && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['pinSalt', 'pinVerifier', 'kdfIterations', 'biometricEnabled'])
        && request.resource.data.pinSalt is string
        && request.resource.data.pinVerifier is string
        && request.resource.data.kdfIterations is number
        && request.resource.data.biometricEnabled is bool;
    }

    // Everything else is closed.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}`;

/* ------------------------------ sync mode ------------------------------ */

export const SYNC_MODES = [
  {
    id: 'manual',
    label: 'Manual',
    hint: 'Only pulls when you tap Sync. Cheapest — most days this reads nothing at all.',
  },
  {
    id: 'open',
    label: 'When the app opens',
    hint: 'One small check per launch, asking only for what changed.',
  },
  {
    id: 'live',
    label: 'Live',
    hint: 'Changes appear immediately. Still delta-only, but it holds an open connection.',
  },
];

export const loadSyncMode = () => localStorage.getItem('daybook.syncMode') || 'open';
