/**
 * Firestore REST client for the Workers runtime.
 *
 * firebase-admin can't run here — its Firestore client goes through
 * @google-cloud/firestore -> google-gax -> @grpc/grpc-js, a Node-native gRPC
 * client built on raw net/tls/http2 sockets that don't exist in Workers. So
 * this talks to https://firestore.googleapis.com/v1/... directly, and
 * authenticates the same way the Admin SDK does under the hood — a JWT
 * signed with the service account's private key, exchanged for an OAuth2
 * access token — just with Web Crypto (crypto.subtle) instead of Node's
 * crypto module, since only that's available in a Worker.
 *
 * Callers get one access token per scheduled run (see getAccessToken) and
 * pass it into every call below — no point re-signing a JWT per request when
 * the token is valid for an hour and a run takes seconds.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlFromString(str) {
  return base64url(new TextEncoder().encode(str));
}

/** PEM (PKCS8) -> the raw DER bytes Web Crypto's importKey wants. */
function pemToDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Signs a Google service-account JWT (RS256) and exchanges it for an OAuth2
 * access token — the standard JWT Bearer flow, same one firebase-admin runs
 * internally, just done by hand with crypto.subtle.
 */
export async function getAccessToken({ clientEmail, privateKeyPem, scope = FIRESTORE_SCOPE }) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: clientEmail,
    scope,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const unsigned = `${base64urlFromString(JSON.stringify(header))}.${base64urlFromString(JSON.stringify(claims))}`;

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64url(new Uint8Array(sig))}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  const { access_token } = await res.json();
  return access_token;
}

/* ---- Firestore's typed-value wire format <-> plain JS ---- */

function fsValueToJs(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue; // already an ISO string
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsValueToJs);
  if ('mapValue' in v) return fsFieldsToJs(v.mapValue.fields || {});
  return null;
}

function fsFieldsToJs(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fsValueToJs(v);
  return out;
}

function jsToFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(jsToFsValue) } };
  if (typeof v === 'object') return { mapValue: { fields: jsToFsFields(v) } };
  return { nullValue: null };
}

function jsToFsFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = jsToFsValue(v);
  return out;
}

/** A REST document -> { id, ...plain record shape the app's code expects }. */
function toRecord(doc) {
  const id = doc.name.split('/').pop();
  return { id, ...fsFieldsToJs(doc.fields || {}) };
}

/* ---- calls used by the scheduled handler ---- */

/**
 * All user doc IDs under /users — mirrors listDocuments()'s "refs only, no
 * field reads" behaviour via a field mask, and follows nextPageToken so a
 * user base bigger than one page never silently gets truncated.
 *
 * showMissing=true is required here: the client (src/core/db/firebase.js)
 * only ever writes to users/{uid}/records/*, never to the users/{uid}
 * document itself, so every user doc is a Firestore "missing" document —
 * one that exists only implicitly as a parent of a non-empty subcollection.
 * REST's documents.list excludes those by default (unlike the Admin SDK's
 * listDocuments(), which includes them transparently), so without this flag
 * every user is silently invisible to this query.
 */
export async function listUserIds(token, projectId) {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users`;
  const ids = [];
  let pageToken;
  do {
    const url = new URL(base);
    url.searchParams.set('pageSize', '300');
    url.searchParams.set('mask.fieldPaths', '__name__');
    url.searchParams.set('showMissing', 'true');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`listUserIds failed: ${res.status} ${await res.text().catch(() => '')}`);
    const data = await res.json();
    for (const doc of data.documents || []) ids.push(doc.name.split('/').pop());
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function runQuery(token, projectId, uid, structuredQuery) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error(`runQuery failed: ${res.status} ${await res.text().catch(() => '')}`);
  const rows = await res.json();
  return rows.filter((r) => r.document).map((r) => toRecord(r.document));
}

/** records where dueAt is within [from, now] — same window as the original. */
export function queryDue(token, projectId, uid, from, now) {
  return runQuery(token, projectId, uid, {
    from: [{ collectionId: 'records' }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          { fieldFilter: { field: { fieldPath: 'dueAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: from } } },
          { fieldFilter: { field: { fieldPath: 'dueAt' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: now } } },
        ],
      },
    },
  });
}

/** records of the given type (used for the push-subscription lookup). */
export function queryByType(token, projectId, uid, type) {
  return runQuery(token, projectId, uid, {
    from: [{ collectionId: 'records' }],
    where: { fieldFilter: { field: { fieldPath: 'type' }, op: 'EQUAL', value: { stringValue: type } } },
  });
}

async function patch(token, projectId, uid, recordId, fields, maskPaths) {
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/records/${recordId}`);
  for (const p of maskPaths) url.searchParams.append('updateMask.fieldPaths', p);

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`patch failed: ${res.status} ${await res.text().catch(() => '')}`);
}

/** Soft-delete a dead push subscription. */
export function patchDeletedAt(token, projectId, uid, recordId, deletedAtIso) {
  return patch(token, projectId, uid, recordId, { deletedAt: { stringValue: deletedAtIso } }, ['deletedAt']);
}

/** Merge pushedAt into data and bump updatedAt — marks a record as sent. */
export function patchPushed(token, projectId, uid, recordId, dataObj, updatedAtIso) {
  return patch(
    token, projectId, uid, recordId,
    { data: { mapValue: { fields: jsToFsFields(dataObj) } }, updatedAt: { stringValue: updatedAtIso } },
    ['data', 'updatedAt']
  );
}
