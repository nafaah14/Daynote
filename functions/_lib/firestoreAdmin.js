/**
 * Minimal service-account Firestore REST client for Pages Functions — just
 * enough to read/write the one refresh-token doc Drive scanning needs.
 *
 * firebase-admin can't run in this runtime (it needs Node's net/tls/http2,
 * not available to Workers/Pages Functions), so this talks to
 * https://firestore.googleapis.com/v1/... directly and authenticates the
 * same way the Admin SDK does under the hood: a JWT signed with the service
 * account's private key, exchanged for an OAuth2 access token. Deliberately
 * NOT shared with workers/send-reminders/src/firestore.js — that's a
 * separate Cloudflare deployable (a standalone Worker, not a Pages
 * Function), and importing across that boundary for code reuse would
 * couple two independently-deployed things together for no real benefit;
 * this file is the same ~40-line JWT-signing core, scoped to exactly what
 * this module needs instead of that file's query/patch helpers.
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

/** Signs a service-account JWT (RS256) and exchanges it for an OAuth2
 *  access token — the standard JWT Bearer flow. `env` needs FB_CLIENT_EMAIL
 *  and FB_PRIVATE_KEY (the same service account send-reminders already
 *  uses — added separately here since Pages Functions and that Worker
 *  have independent environment-variable configuration in the dashboard,
 *  even though the values are identical). */
async function getAccessToken(env) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(env.FB_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: env.FB_CLIENT_EMAIL,
    scope: FIRESTORE_SCOPE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const unsigned = `${base64urlFromString(JSON.stringify(header))}.${base64urlFromString(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(new Uint8Array(sig))}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Service-account token exchange failed: ${res.status} ${await res.text().catch(() => '')}`);
  const { access_token } = await res.json();
  return access_token;
}

/** Reads driveRefreshTokens/{uid}.refreshToken, or null if there isn't one. */
export async function getRefreshToken(env, uid) {
  const token = await getAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${env.FB_PROJECT_ID}/databases/(default)/documents/driveRefreshTokens/${uid}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getRefreshToken failed: ${res.status} ${await res.text().catch(() => '')}`);
  const doc = await res.json();
  return doc.fields?.refreshToken?.stringValue || null;
}

/** Sets driveRefreshTokens/{uid}.refreshToken (whole-doc set, not merge —
 *  there is only ever this one field, so there's nothing a merge would be
 *  protecting). */
export async function setRefreshToken(env, uid, refreshToken) {
  const token = await getAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${env.FB_PROJECT_ID}/databases/(default)/documents/driveRefreshTokens/${uid}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      fields: {
        refreshToken: { stringValue: refreshToken },
        updatedAt: { stringValue: new Date().toISOString() },
      },
    }),
  });
  if (!res.ok) throw new Error(`setRefreshToken failed: ${res.status} ${await res.text().catch(() => '')}`);
}
