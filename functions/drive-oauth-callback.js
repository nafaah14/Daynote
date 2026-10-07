/**
 * Google redirects the browser here after consent, with `?code=&state=`.
 * This is a plain top-level navigation — no Authorization header, no
 * session — so `state`'s signature (see _lib/oauthState.js) is the ONLY
 * thing establishing whose account this is.
 *
 * Exchanges `code` for tokens, stores the refresh token server-side
 * (driveRefreshTokens/{uid} — never client-readable, see the Firestore
 * rules), then redirects back into the app. The app reads the
 * driveConnected/driveError query param and flips its own client-writable
 * `connected` flag itself — this function never touches that doc, keeping
 * its Firestore-admin footprint to just the one secret.
 *
 * Needs the same FB_PROJECT_ID/OAUTH_STATE_SECRET/GOOGLE_CLIENT_ID as
 * drive-oauth-start.js, plus:
 *   GOOGLE_CLIENT_SECRET   (from Google Cloud — Secret, never VITE_-prefixed)
 *   GOOGLE_REDIRECT_URI    (must match exactly — this IS that URL)
 *   FB_CLIENT_EMAIL, FB_PRIVATE_KEY   (the service account, for storing the token)
 */
import { verifyState } from './_lib/oauthState.js';
import { setRefreshToken } from './_lib/firestoreAdmin.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function redirectTo(path) {
  return new Response(null, { status: 302, headers: { location: path } });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const googleError = url.searchParams.get('error'); // user clicked "Cancel" on consent

  if (googleError) {
    return redirectTo(`/test/file-organizer?driveError=${encodeURIComponent(googleError)}`);
  }
  if (!code || !state) {
    return redirectTo('/test/file-organizer?driveError=missing_code_or_state');
  }

  let uid;
  try {
    uid = await verifyState(env, state);
  } catch (e) {
    return redirectTo(`/test/file-organizer?driveError=${encodeURIComponent(e.message)}`);
  }

  let tokenRes;
  try {
    tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
  } catch {
    return redirectTo('/test/file-organizer?driveError=token_exchange_unreachable');
  }

  const tokenData = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !tokenData?.refresh_token) {
    // No refresh_token usually means Google didn't see a fresh consent —
    // shouldn't happen given prompt=consent on the start side, but surface
    // it plainly rather than storing nothing and failing silently later.
    const reason = tokenData?.error_description || tokenData?.error || 'no_refresh_token_returned';
    return redirectTo(`/test/file-organizer?driveError=${encodeURIComponent(reason)}`);
  }

  try {
    await setRefreshToken(env, uid, tokenData.refresh_token);
  } catch (e) {
    return redirectTo(`/test/file-organizer?driveError=${encodeURIComponent(e.message)}`);
  }

  return redirectTo('/test/file-organizer?driveConnected=1');
}
