/**
 * Client-side crypto for Personal Info's sensitive fields. Native SubtleCrypto
 * only — no external crypto dependency.
 *
 * The PIN itself and the derived AES key never leave this module in raw form:
 * Firestore only ever sees a salt, a verifier (an HMAC, not the PIN), and
 * ciphertext. Losing the PIN means losing the sensitive records — there is no
 * backdoor, by design (see UI copy at PIN setup).
 */

export const KDF_ITERATIONS = 210000;

const VERIFY_STRING = 'daybook-personal-info-pin-v1';
const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function fromB64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function generateSalt() {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

async function deriveBits(pin, saltB64, iterations) {
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromB64(saltB64), iterations, hash: 'SHA-256' },
    baseKey,
    256
  );
}

/**
 * extractable: true — not needed until the biometric (WebAuthn PRF) unlock
 * phase, which wraps this key for device-local storage. Harmless until then.
 */
export async function deriveAesKey(pin, saltB64, iterations) {
  const bits = await deriveBits(pin, saltB64, iterations);
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

async function deriveHmacKey(pin, saltB64, iterations) {
  const bits = await deriveBits(pin, saltB64, iterations);
  return crypto.subtle.importKey('raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Computed once at PIN setup and stored in users/{uid}/security/main. */
export async function makePinVerifier(pin, saltB64, iterations) {
  const key = await deriveHmacKey(pin, saltB64, iterations);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(VERIFY_STRING));
  return toB64(new Uint8Array(sig));
}

/** True if `pin` is the one that produced `verifierB64`. Never stores the PIN to check this. */
export async function verifyPin(pin, saltB64, iterations, verifierB64) {
  const key = await deriveHmacKey(pin, saltB64, iterations);
  return crypto.subtle.verify('HMAC', key, fromB64(verifierB64), enc.encode(VERIFY_STRING));
}

/** Random IV per call — required for AES-GCM; reusing an IV under the same key breaks confidentiality. */
export async function encryptField(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return { encrypted: toB64(new Uint8Array(ct)), iv: toB64(iv) };
}

export async function decryptField(encryptedB64, ivB64, key) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) },
    key,
    fromB64(encryptedB64)
  );
  return dec.decode(pt);
}
