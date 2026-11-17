/** 'ok' | 'insecure' | 'no-xr' | 'no-ar' — can this browser run an AR session? */
export async function arSupport() {
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'insecure';
  const xr = typeof navigator !== 'undefined' ? navigator.xr : null;
  if (!xr) return 'no-xr';
  try {
    return (await xr.isSessionSupported('immersive-ar')) ? 'ok' : 'no-ar';
  } catch {
    return 'no-ar';
  }
}

const NOTES = {
  insecure: 'AR needs a secure page (https, or localhost over USB).',
  'no-xr': 'This browser has no WebXR. Use Chrome on an ARCore Android phone.',
  'no-ar': 'This device can’t run AR. It needs an ARCore phone with Google Play Services for AR.',
};

/** One line saying whether this phone can scan. */
export function SupportNote({ support }) {
  if (support === null) return <p className="rs-sub">Checking for AR…</p>;
  if (support === 'ok') return <p className="rs-sub rs-ok">AR is available on this phone.</p>;
  return <p className="rs-error">{NOTES[support]}</p>;
}
