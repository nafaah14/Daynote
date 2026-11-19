import { useEffect, useRef, useState } from 'react';
import { AlarmClock, Check, BellOff } from 'lucide-react';
import { useRepo } from '../db/repo';
import './alarm.css';

/**
 * The full-screen alarm. Core knows nothing about reminders: a module offers
 * `alarms({ repo, now }) => [{ key, id, title, when, stop, snooze(min), done }]`
 * on its manifest for whatever should be ringing right now, and this rings
 * the first one until it is stopped, snoozed or done.
 *
 * Only while Daybook is open — a closed web app can't make sound. Push
 * notifications cover a closed app (sticky, long vibration; see sw.js).
 */

const CHECK_MS = 5_000;
const SILENCE_AFTER_MS = 10 * 60_000;
const SNOOZES = [5, 10, 30];

/** A loud two-tone beep pattern from the Web Audio API — no sound file. */
function makeRinger() {
  let ctx = null;
  let timer = null;
  let vib = null;
  const beepSet = () => {
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + 0.02;
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * 0.32;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(i % 2 ? 1320 : 990, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.45, t + 0.02);
      gain.gain.setValueAtTime(0.45, t + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    }
  };
  return {
    /** Returns false when the browser wants a tap before it plays sound. */
    async start() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!ctx && AC) ctx = new AC();
        if (ctx?.state === 'suspended') await ctx.resume().catch(() => {});
      } catch { /* no audio */ }
      if (!timer) {
        beepSet();
        timer = setInterval(beepSet, 2000);
      }
      if (!vib && navigator.vibrate) {
        const buzz = () => { try { navigator.vibrate([700, 250, 700, 250, 700]); } catch { /* not allowed */ } };
        buzz();
        vib = setInterval(buzz, 3500);
      }
      return ctx?.state === 'running';
    },
    stop() {
      clearInterval(timer); timer = null;
      clearInterval(vib); vib = null;
      try { navigator.vibrate?.(0); } catch { /* ignore */ }
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}

/** Clears this alarm's notification from the shade once it's handled here. */
async function clearNotifications(id) {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const list = (await reg?.getNotifications()) || [];
    list.filter((n) => (n.tag || '').includes(id) || (n.data?.url || '').includes(id)).forEach((n) => n.close());
  } catch { /* ignore */ }
}

const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function AlarmHost({ modules }) {
  const repo = useRepo();
  const [now, setNow] = useState(() => Date.now());
  const [needsTap, setNeedsTap] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const ringer = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), CHECK_MS);
    const onVisible = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const ringing = repo.loading ? [] : modules.flatMap((m) => {
    try { return typeof m.alarms === 'function' ? m.alarms({ repo, now }) || [] : []; } catch { return []; }
  });
  const alarm = ringing[0] || null;
  const key = alarm?.key || null;

  useEffect(() => {
    if (!key) return undefined;
    setSilenced(false);
    const r = makeRinger();
    ringer.current = r;
    r.start().then((ok) => setNeedsTap(!ok));
    const quiet = setTimeout(() => { r.stop(); setSilenced(true); }, SILENCE_AFTER_MS);
    return () => { clearTimeout(quiet); r.stop(); ringer.current = null; setNeedsTap(false); };
  }, [key]);

  if (!alarm) return null;

  const finish = (fn) => {
    ringer.current?.stop();
    clearNotifications(alarm.id);
    fn();
    setNow(Date.now());
  };
  const wake = () => {
    if (!needsTap || silenced) return;
    ringer.current?.start().then((ok) => setNeedsTap(!ok));
  };

  return (
    <div className="alarm-screen" role="alertdialog" aria-modal="true" aria-label={`Alarm: ${alarm.title}`} onPointerDown={wake}>
      <div className="alarm-body">
        <div className={`alarm-icon ${silenced ? '' : 'is-ringing'}`}><AlarmClock size={46} strokeWidth={1.6} /></div>
        <div className="alarm-time mono">{timeOf(alarm.when)}</div>
        <h2 className="alarm-title">{alarm.title}</h2>
        {ringing.length > 1 && <p className="alarm-more">+{ringing.length - 1} more ringing</p>}
        {needsTap && !silenced && <p className="alarm-hint">Tap anywhere to sound the alarm</p>}
        {silenced && <p className="alarm-hint">Silenced after 10 minutes</p>}
      </div>
      <div className="alarm-actions">
        <div className="alarm-snoozes">
          {SNOOZES.map((m) => (
            <button key={m} type="button" className="alarm-btn" onClick={() => finish(() => alarm.snooze(m))}>
              Snooze {m} min
            </button>
          ))}
        </div>
        <button type="button" className="alarm-btn alarm-stop" onClick={() => finish(alarm.stop)}>
          <BellOff size={18} /> Stop
        </button>
        {alarm.done && (
          <button type="button" className="alarm-btn alarm-done" onClick={() => finish(alarm.done)}>
            <Check size={18} /> Mark done
          </button>
        )}
      </div>
    </div>
  );
}
