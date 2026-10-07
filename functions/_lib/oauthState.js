/**
 * Signs/verifies the OAuth `state` param that carries a uid through the
 * Google consent redirect.
 *
 * The callback (drive-oauth-callback.js) has no session or auth header to
 * check — it's a plain top-level browser navigation Google makes, with
 * only `code` and `state` as query params. Without a server signature
 * tying `state`'s uid to a REAL verified session at the moment the flow
 * started, anyone could hand-craft a callback URL with someone else's uid
 * in `state` and have their own Drive authorization's refresh token
 * stored against a victim's account. Signing here (with a secret only
 * these functions hold) is what makes that forgery impossible.
 */

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(env) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.OAUTH_STATE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

/** Signs { uid, exp } into an opaque state string, valid for 10 minutes —
 *  comfortably longer than Google's consent screen should ever take, short
 *  enough that a leaked/logged URL stops being useful quickly. */
export async function signState(env, uid) {
  const payload = JSON.stringify({ uid, exp: Math.floor(Date.now() / 1000) + 600 });
  const payloadB64 = base64url(new TextEncoder().encode(payload));
  const key = await hmacKey(env);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64url(new Uint8Array(sig))}`;
}

/** Verifies a state string and returns the uid inside it. Throws on a bad
 *  signature or an expired state. */
export async function verifyState(env, state) {
  const [payloadB64, sigB64] = String(state || '').split('.');
  if (!payloadB64 || !sigB64) throw new Error('Malformed state.');
  const key = await hmacKey(env);
  const ok = await crypto.subtle.verify(
    'HMAC', key, base64urlToBytes(sigB64), new TextEncoder().encode(payloadB64)
  );
  if (!ok) throw new Error('State signature is invalid.');
  const { uid, exp } = JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadB64)));
  if (!uid) throw new Error('State has no uid.');
  if (exp < Math.floor(Date.now() / 1000)) throw new Error('State has expired — start connecting again.');
  return uid;
}
