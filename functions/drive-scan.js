/**
 * "Scan now" — lists files in the watched Drive folder. Manual only, no
 * cron: the frontend calls this exactly when the button is pressed.
 *
 * Returns the raw file list; it does NOT touch Firestore for anything
 * except reading the refresh token. Diffing against known files and
 * creating "unfiled" entries happens client-side, the same way every other
 * write in this module already goes straight through the client SDK —
 * this function's only reason to exist is that the refresh token it needs
 * is deliberately not something the client can read.
 *
 * Needs the same FB_PROJECT_ID/FB_CLIENT_EMAIL/FB_PRIVATE_KEY as
 * drive-oauth-callback.js, plus GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET.
 */
import { requireFirebaseUser } from './_lib/firebaseAuth.js';
import { getRefreshToken } from './_lib/firestoreAdmin.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
// Same shape the frontend's own link parser accepts — checked again here
// since folderId ends up interpolated into a Drive query string below,
// and this is the boundary where a client could send anything at all.
const FOLDER_ID_RE = /^[a-zA-Z0-9_-]+$/;

function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json' } });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.FB_PROJECT_ID || !env.FB_CLIENT_EMAIL || !env.FB_PRIVATE_KEY || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return errorResponse(500, 'Drive scan is not configured (missing environment variables).');
  }

  let uid;
  try {
    ({ uid } = await requireFirebaseUser(request, env));
  } catch (e) {
    return errorResponse(401, e.message);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'Request body must be JSON.');
  }
  const { folderId } = body || {};
  if (!folderId || !FOLDER_ID_RE.test(folderId)) {
    return errorResponse(400, 'A valid Drive folder ID is required.');
  }

  let refreshToken;
  try {
    refreshToken = await getRefreshToken(env, uid);
  } catch (e) {
    return errorResponse(502, e.message);
  }
  if (!refreshToken) {
    return errorResponse(409, 'Drive is not connected — connect it first.');
  }

  let tokenRes;
  try {
    tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    });
  } catch {
    return errorResponse(502, 'Could not reach Google to refresh the Drive connection.');
  }
  const tokenData = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !tokenData?.access_token) {
    // A revoked/expired refresh token lands here — surface it as "not
    // connected" so the frontend's UI state matches reality, rather than
    // a generic scan failure that looks transient when it isn't.
    return errorResponse(409, tokenData?.error_description || 'Drive connection is no longer valid — reconnect it.');
  }

  const driveUrl = new URL(DRIVE_FILES_URL);
  driveUrl.searchParams.set('q', `'${folderId}' in parents and trashed=false`);
  driveUrl.searchParams.set('fields', 'files(id,name,mimeType,webViewLink,modifiedTime)');

  let driveRes;
  try {
    driveRes = await fetch(driveUrl, { headers: { authorization: `Bearer ${tokenData.access_token}` } });
  } catch {
    return errorResponse(502, 'Could not reach Google Drive.');
  }
  const driveData = await driveRes.json().catch(() => null);
  if (!driveRes.ok) {
    return errorResponse(driveRes.status, driveData?.error?.message || 'Drive API request failed.');
  }

  return new Response(JSON.stringify({ files: driveData.files || [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
