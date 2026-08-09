/**
 * Speech in and out, for the Mandarin drills.
 *
 * Recognition uses the browser's own engine (webkitSpeechRecognition). The
 * original app could also score through Azure for syllable-level accuracy and
 * fluency numbers; that path is left out here because it needs an external SDK
 * and an API key, and the browser engine covers the actual job — did you say
 * the right thing — with no setup at all.
 *
 * Two hard requirements the UI has to be honest about: it only works in
 * Chromium browsers, and it only works over HTTPS (or localhost).
 */

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export const recognitionSupported = () => !!SR;
export const secureEnough = () =>
  typeof window === 'undefined'
  || window.isSecureContext
  || location.hostname === 'localhost';

/** Strip punctuation and spaces so "你好！" matches "你好". */
export const strip = (s) => (s || '').replace(/[\s，。！？、,.!?；;：:]/g, '');

/**
 * Compare what was heard against the target, character by character, and
 * return which characters matched so the UI can mark them.
 *
 * The engine returns several alternatives; we keep the best-scoring one, since
 * Mandarin recognition frequently gets the right sounds with the wrong
 * homophone characters on its first guess.
 */
export function scoreAgainst(target, alternatives) {
  const t = strip(target);
  let best = { ratio: 0, flags: t.split('').map(() => false), heard: '' };

  alternatives.forEach((alt) => {
    const h = strip(alt);
    const flags = [];
    let hits = 0;
    for (let k = 0; k < t.length; k++) {
      const ok = h[k] === t[k];
      flags.push(ok);
      if (ok) hits++;
    }
    // treat "contains the whole phrase" as a pass — the engine often adds a
    // trailing particle or splits a phrase differently
    const contains = h.includes(t) || (t.includes(h) && h.length >= t.length * 0.8);
    const ratio = contains ? 1 : (t.length ? hits / t.length : 0);
    if (ratio > best.ratio) {
      best = { ratio, flags: contains ? t.split('').map(() => true) : flags, heard: h };
    }
  });

  return { ...best, pass: best.ratio >= 0.999 };
}

const ERRORS = {
  unsupported: 'Speech input needs Chrome or Edge. Everything else here still works.',
  insecure: 'Microphone needs HTTPS. It works on your deployed site, not over plain http.',
  'not-allowed': 'Microphone blocked. Allow mic access for this site and try again.',
  'service-not-allowed': 'Microphone blocked by the browser or OS.',
  'no-speech': 'Nothing heard. Tap the mic and speak once it turns red.',
  network: 'Recognition needs an internet connection.',
  aborted: 'Stopped listening.',
};

export const errorMessage = (code) => ERRORS[code] || `Stopped: ${code}`;

/** Start listening. Returns a stop() you can call to cancel. */
export function listen(target, { onResult, onStateChange }) {
  if (!SR) { onResult({ error: 'unsupported' }); return () => {}; }
  if (!secureEnough()) { onResult({ error: 'insecure' }); return () => {}; }

  window.speechSynthesis?.cancel();

  const rec = new SR();
  rec.lang = 'zh-CN';
  rec.interimResults = false;
  rec.maxAlternatives = 6;
  rec.continuous = false;

  onStateChange?.('listening');

  rec.onresult = (ev) => {
    const alts = [...ev.results[0]].map((a) => a.transcript);
    onResult(scoreAgainst(target, alts));
  };
  rec.onerror = (ev) => onResult({ error: ev.error });
  rec.onend = () => onStateChange?.('idle');

  try { rec.start(); }
  catch { onStateChange?.('idle'); }

  return () => { try { rec.abort(); } catch { /* already stopped */ } };
}

/* ------------------------------ speaking ------------------------------- */

let voice = null;

function pickVoice() {
  if (voice) return voice;
  const all = window.speechSynthesis?.getVoices() || [];
  voice = all.find((v) => /^zh[-_]CN/i.test(v.lang))
    || all.find((v) => /^zh/i.test(v.lang))
    || null;
  return voice;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { voice = null; pickVoice(); };
}

export const speechSupported = () =>
  typeof window !== 'undefined' && !!window.speechSynthesis;

export function speak(text, { rate = 0.85 } = {}) {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = rate;
  const v = pickVoice();
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

export const stopSpeaking = () => window.speechSynthesis?.cancel();
