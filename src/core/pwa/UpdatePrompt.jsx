import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '../ui/components';
import './pwa.css';

/**
 * Watches the existing service worker registration (registered in
 * main.jsx — this component doesn't register a second one) for a new,
 * already-installed worker sitting in "waiting", and offers to swap it in.
 *
 * PWAs tend to stay resident across app switches rather than reloading, so a
 * cold-load check alone isn't enough — the visibilitychange listener forces
 * a fresh check every time the app is foregrounded.
 */
export default function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const regRef = useRef(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const watch = (registration) => {
      regRef.current = registration;
      if (registration.waiting && registration.active) setNeedRefresh(true);

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setNeedRefresh(true);
          }
        });
      });
    };

    navigator.serviceWorker.ready.then(watch);

    const onVisible = () => {
      if (document.visibilityState === 'visible') regRef.current?.update();
    };
    document.addEventListener('visibilitychange', onVisible);

    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!needRefresh || dismissed) return null;

  const applyUpdate = () => {
    setUpdating(true);
    const waiting = regRef.current?.waiting;
    if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
    else window.location.reload();
  };

  return (
    <div className="update-toast card" role="status">
      <span className="update-toast-text">A new version of Daybook is available</span>
      <div className="update-toast-actions">
        <Button size="sm" onClick={() => setDismissed(true)} aria-label="Dismiss">
          <X size={14} />
        </Button>
        <Button size="sm" variant="primary" onClick={applyUpdate} disabled={updating}>
          <RefreshCw size={14} className={updating ? 'spin' : ''} />
          {updating ? 'Updating…' : 'Update'}
        </Button>
      </div>
    </div>
  );
}
