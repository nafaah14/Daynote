import { useEffect, useState } from 'react';
import './SplashScreen.css';

const TOTAL_DURATION = 1300; // ms — must match CSS animation timings below
const STATUS_SWAP_AT = 750;

export default function SplashScreen({ onFinish }) {
  const [status, setStatus] = useState('INITIALISING');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const swapTimer = setTimeout(() => setStatus('READY'), STATUS_SWAP_AT);
    const hideTimer = setTimeout(() => setHidden(true), TOTAL_DURATION - 350);
    const finishTimer = setTimeout(() => onFinish?.(), TOTAL_DURATION);
    return () => {
      clearTimeout(swapTimer);
      clearTimeout(hideTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div className={`db-splash${hidden ? ' db-splash--hidden' : ''}`}>
      <div className="db-splash__bg" />
      <div className="db-splash__grid" />
      <div className="db-splash__glow" />

      <div className="db-splash__content">
        <svg className="db-splash__mark" viewBox="0 0 512 512">
          <defs>
            <linearGradient id="db-bl" x1="150" y1="150" x2="230" y2="400" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#F3DEBA" /><stop offset="1" stopColor="#D9AE78" />
            </linearGradient>
            <linearGradient id="db-br" x1="282" y1="150" x2="362" y2="400" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#F6E4C4" /><stop offset="1" stopColor="#DDB47E" />
            </linearGradient>
            <linearGradient id="db-bd" x1="190" y1="165" x2="322" y2="385" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#E9CB9E" /><stop offset="1" stopColor="#C99A63" />
            </linearGradient>
          </defs>
          <rect x="220.16" y="87.04" width="71.68" height="337.92" rx="35.84" fill="url(#db-bd)" transform="rotate(-23 256 256)" />
          <rect x="153.6" y="102.4" width="71.68" height="307.2" rx="35.84" fill="url(#db-bl)" />
          <rect x="286.72" y="102.4" width="71.68" height="307.2" rx="35.84" fill="url(#db-br)" />
        </svg>

        <div className="db-splash__wordmark">DAYBOOK</div>
        <div className="db-splash__rule" />
        <div className="db-splash__subtitle">PERSONAL WORKSPACE</div>
      </div>

      <div className="db-splash__footer">
        <div className="db-splash__progress-track">
          <div className="db-splash__progress-fill" />
        </div>
        <div className={`db-splash__status${status === 'READY' ? ' db-splash__status--ready' : ''}`}>
          {status}
        </div>
        <div className="db-splash__credit">
          <span className="db-splash__dash">—</span>Designed by <b>Nafaah</b><span className="db-splash__dash">—</span>
        </div>
      </div>
    </div>
  );
}
