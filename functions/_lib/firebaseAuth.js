/**
 * Manual Firebase ID token verification — no firebase-admin here (same
 * runtime limitation as firestoreAdmin.js), so this does by hand what
 * admin.auth().verifyIdToken() does: fetch Google's public keys for the
 * token's issuer, verify the RS256 signature, then check iss/aud/exp.
 *
 * Every function that trusts a uid for a Drive operation calls this on the
 * request's Authorization header rather than accepting a uid the client
 * sends directly — a client-supplied uid would let anyone read or trigger
 * a scan for ANY account just by sending a different uid in the body.
 */

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

function base64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function base64urlToJson(b64url) {
  return JSON.parse(new TextDecoder().decode(base64urlToBytes(b64url)));
}

// Module-level cache: Pages Functions reuse the same isolate across nearby
// invocations, so this avoids a JWKS fetch on every single request — only
// refetched once the cached set is more than an hour old.
let jwksCache = null;
let jwksCachedAt = 0;

async function getJwks() {
  if (jwksCache && Date.now() - jwksCachedAt < 3600_000) return jwksCache;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`Could not fetch Firebase's public keys: ${res.status}`);
  const { keys } = await res.json();
  jwksCache = keys;
  jwksCachedAt = Date.now();
  return keys;
}

/**
 * Verifies the Firebase ID token in `request`'s Authorization header and
 * returns { uid }. Throws on anything wrong — missing header, bad
 * signature, wrong project, expired. `env.FB_PROJECT_ID` is the same value
 * firestoreAdmin.js already needs.
 */
export async function requireFirebaseUser(request, env) {
  const header = request.headers.get('authorization') || '';
  const m = header.match(/^Bearer (.+)$/);
  if (!m) throw new Error('Missing Authorization: Bearer <Firebase ID token> header.');
  const idToken = m[1];

  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token.');
  const [headerB64, payloadB64, sigB64] = parts;

  const jwtHeader = base64urlToJson(headerB64);
  const claims = base64urlToJson(payloadB64);

  const keys = await getJwks();
  const jwk = keys.find((k) => k.kid === jwtHeader.kid);
  if (!jwk) throw new Error('Token signed with an unrecognised key.');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    base64urlToBytes(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!ok) throw new Error('ID token signature is invalid.');

  const nowSec = Math.floor(Date.now() / 1000);
  if (claims.exp < nowSec) throw new Error('ID token has expired.');
  if (claims.iat > nowSec + 60) throw new Error('ID token issued in the future.');
  if (claims.aud !== env.FB_PROJECT_ID) throw new Error('ID token is for a different Firebase project.');
  if (claims.iss !== `https://securetoken.google.com/${env.FB_PROJECT_ID}`) throw new Error('ID token has the wrong issuer.');
  if (!claims.sub) throw new Error('ID token has no subject.');

  return { uid: claims.sub };
}
