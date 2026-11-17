import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Undo2, Eraser, Check, ScanLine } from 'lucide-react';
import { Card, SectionLabel, Button, Input } from '../../core/ui/components';
import { startMeasure } from './lib/arSession';
import { segments, pathLength, formatLength, dist3, tapeCheck, MIN_HIT_RANGE } from './lib/geometry';
import { SupportNote, arSupport } from './support';

/**
 * Milestone v0.2.0 of the plan — the AR proof: tap points on real surfaces
 * and read the distances, to check accuracy against a tape before building
 * room capture on it.
 */
export default function Measure() {
  const nav = useNavigate();
  const overlay = useRef(null);
  const ctl = useRef(null);
  const [support, setSupport] = useState(null);
  const [live, setLive] = useState(null);     // updates while the session runs
  const [result, setResult] = useState(null); // points from the last session
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => { arSupport().then(setSupport); }, []);
  useEffect(() => () => ctl.current?.end(), []); // leaving the page ends AR

  const start = async () => {
    setError('');
    setStarting(true);
    overlay.current.style.display = 'flex'; // must be showing as the session starts
    try {
      ctl.current = await startMeasure({
        overlay: overlay.current,
        onUpdate: setLive,
        onEnd: (points) => {
          ctl.current = null;
          if (overlay.current) overlay.current.style.display = '';
          setLive(null);
          if (points.length > 1) setResult(points);
        },
      });
      setResult(null);
    } catch (e) {
      if (overlay.current) overlay.current.style.display = '';
      setError(e?.message || 'AR could not start.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="page rs-page">
      <button className="link-btn rs-back" onClick={() => nav('/roomscan')}><ArrowLeft size={14} /> RoomScan</button>
      <h1 className="page-title serif">Measure test</h1>

      <Card className="rs-card">
        <p className="rs-text">
          Lay a tape on the floor. Start AR, sweep the phone slowly for a few seconds until the ring appears,
          then tap at each end of the tape. Stand 1–3 m away; points closer than {MIN_HIT_RANGE * 100} cm
          to the phone are ignored (the ring turns amber).
        </p>
        <SupportNote support={support} />
        {error && <p className="rs-error">{error}</p>}
        <Button variant="primary" onClick={start} disabled={support !== 'ok' || starting}>
          <ScanLine size={16} /> {starting ? 'Starting…' : 'Start AR'}
        </Button>
      </Card>

      {result && <Results points={result} />}

      {createPortal(
        <div ref={overlay} className="rs-overlay">
          <ArHud live={live} ctl={ctl} />
        </div>,
        document.body,
      )}
    </div>
  );
}

/** What's drawn over the camera. */
function ArHud({ live, ctl }) {
  if (!live) return null;
  const { points, hit, tooClose } = live;
  const last = points[points.length - 1];
  const steps = segments(points);
  const hint = !hit ? 'Sweep slowly to find the surface'
    : tooClose ? 'Too close — step back'
      : points.length === 0 ? 'Tap to mark the first point'
        : 'Tap to mark the next point';

  return (
    <>
      <div className="rs-hud-top" data-ui>
        <div className="rs-hint">{hint}</div>
        {last && hit && <div className="rs-live mono">{formatLength(dist3(last, hit))}</div>}
        {hit && <div className="rs-sub mono">height {formatLength(hit.y)}{live.anchored ? ' · anchored' : ''}</div>}
      </div>
      <div className="rs-hud-bottom" data-ui>
        {steps.length > 0 && (
          <div className="rs-steps mono">
            {steps.slice(-4).map((s, i) => <span key={i}>{formatLength(s)}</span>)}
            {steps.length > 1 && <span className="rs-total">Σ {formatLength(pathLength(points))}</span>}
          </div>
        )}
        <div className="rs-hud-btns">
          <button className="rs-hud-btn" onClick={() => ctl.current?.undo()} disabled={!points.length}><Undo2 size={18} /> Undo</button>
          <button className="rs-hud-btn" onClick={() => ctl.current?.clear()} disabled={!points.length}><Eraser size={18} /> Clear</button>
          <button className="rs-hud-btn is-main" onClick={() => ctl.current?.end()}><Check size={18} /> Done</button>
        </div>
        {!live.overlay && <div className="rs-sub">Press back to finish</div>}
      </div>
    </>
  );
}

/** After the session: each length, with a tape check against what you measured by hand. */
function Results({ points }) {
  const steps = segments(points);
  return (
    <>
      <SectionLabel>Last measurement</SectionLabel>
      <Card className="rs-card">
        {steps.map((s, i) => <ResultRow key={i} n={i + 1} m={s} />)}
        {steps.length > 1 && (
          <div className="rs-row rs-row-total"><span>Total</span><span className="mono">{formatLength(pathLength(points))}</span></div>
        )}
        <p className="rs-sub">Goal for this step: a 1 m tape reads within ±2 cm.</p>
      </Card>
    </>
  );
}

function ResultRow({ n, m }) {
  const [tape, setTape] = useState('');
  const actual = parseFloat(tape) / 100;
  const check = actual > 0 ? tapeCheck(m, actual) : null;
  return (
    <div className="rs-row">
      <span>{n}</span>
      <span className="mono">{formatLength(m)}</span>
      <Input inputMode="decimal" placeholder="tape cm" value={tape} onChange={(e) => setTape(e.target.value)} />
      <span className={`mono rs-check ${check ? (check.ok ? 'is-ok' : 'is-off') : ''}`}>
        {check ? `${check.diff >= 0 ? '+' : ''}${(check.diff * 100).toFixed(1)} cm` : ''}
      </span>
    </div>
  );
}
