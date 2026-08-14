/**
 * Biometric convenience unlock via WebAuthn's PRF extension. PIN remains the
 * required fallback everywhere this is used — nothing here is ever the only
 * way in.
 *
 * Every function here is defensive by design: any unsupported browser,
 * missing PRF support, cancelled prompt, or thrown error resolves to `null`
 * rather than rejecting. Callers should treat `null` as "silently fall back
 * to PIN," never as something to show the user an error about — a "biometric
 * gate with no real key behind it" is what PRF support existing to check for
 * in the first place.
 */

// Fixed, app-specific — not a secret. It just needs to be constant so the
// same PRF input always derives the same secret from a given credential.
const PRF_SALT = new TextEncoder().encode('daybook-personal-info-prf-v1');

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

function toB64Url(bytes) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function platformAuthenticatorAvailable() {
  try {
    if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

async function getPrfSecret(rawId) {
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: rawId }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: PRF_SALT } } },
      },
    });
    const ext = assertion?.getClientExtensionResults();
    return ext?.prf?.results?.first ?? null;
  } catch {
    return null;
  }
}

/**
 * One-time registration, after the PIN is already set. Returns
 * { credentialId, prfSecret } — credentialId is base64url (safe to store),
 * prfSecret is an ArrayBuffer to immediately wrap the AES key with and then
 * discard (never stored itself). Returns null if the device/browser can't
 * do PRF, in which case the caller should just not offer biometric unlock.
 */
export async function registerBiometric(uid) {
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'Daybook' },
        user: { id: new TextEncoder().encode(uid), name: uid, displayName: 'Daybook Personal Info' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000,
        extensions: { prf: { eval: { first: PRF_SALT } } },
      },
    });
    if (!cred) return null;

    const ext = cred.getClientExtensionResults();
    if (!ext.prf?.enabled) return null;

    // Some authenticators return the PRF result at registration; others only
    // hand it back on a subsequent assertion. Try both.
    const secret = ext.prf.results?.first ?? await getPrfSecret(cred.rawId);
    if (!secret) return null;

    return { credentialId: toB64Url(new Uint8Array(cred.rawId)), prfSecret: secret };
  } catch {
    return null;
  }
}

/** Subsequent unlocks: re-assert against the stored credential and fetch the same PRF secret. */
export async function assertBiometric(credentialId) {
  return getPrfSecret(fromB64Url(credentialId));
}
