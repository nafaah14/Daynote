/**
 * Mints the Google consent-screen URL for connecting Drive, with a
 * server-signed `state` carrying the caller's REAL (ID-token-verified) uid.
 *
 * Returns JSON rather than issuing an HTTP redirect itself, because this is
 * called via an authenticated `fetch` (so it can send the Authorization
 * header a Firebase ID token needs) — and a plain top-level browser
 * navigation can't set custom headers. The frontend does the actual
 * navigation itself, via the URL this hands back:
 *
 *   const { url } = await fetch('/drive-oauth-start', { headers: {...} }).then(r => r.json());
 *   window.location.assign(url);
 *
 * Needs, in Cloudflare Pages' environment variables:
 *   FB_PROJECT_ID              (same Firebase project as send-reminders)
 *   OAUTH_STATE_SECRET         (random string, generate once — Secret)
 *   GOOGLE_CLIENT_ID           (from the OAuth client created in Google Cloud)
 *   GOOGLE_REDIRECT_URI        (must exactly match what's registered there,
 *                               e.g. https://daynote-bvc.pages.dev/drive-oauth-callback)
 */
import { requireFirebaseUser } from './_lib/firebaseAuth.js';
import { signState } from './_lib/oauthState.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';

function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json' } });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.FB_PROJECT_ID || !env.OAUTH_STATE_SECRET || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    return errorResponse(500, 'Drive connect is not configured (missing environment variables).');
  }

  let uid;
  try {
    ({ uid } = await requireFirebaseUser(request, env));
  } catch (e) {
    return errorResponse(401, e.message);
  }

  const state = await signState(env, uid);
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  // offline + consent, every time: Google only issues a refresh_token on
  // the FIRST authorization unless prompt=consent forces a fresh one —
  // and re-connecting after a disconnect needs to be real "connect",
  // not a silent no-op grant with nothing new to store.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  return new Response(JSON.stringify({ url: url.toString() }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
