import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

const clamp0 = (n) => Math.max(0, n);
/** Nearest multiple of 5 above `n` — from 36 this gives 40, from 35 it gives 40. */
const snapUp5 = (n) => Math.ceil((n + 1) / 5) * 5;
/** Nearest multiple of 5 below `n` — from 36 this gives 35, from 35 it gives 30. */
const snapDown5 = (n) => clamp0(Math.floor((n - 1) / 5) * 5);

/**
 * Separate hour/minute steppers for approving an entry, instead of one
 * combined h:mm text box. Hours nudge by a full hour; minutes round to the
 * nearest 5 in the direction pressed (36 → 35 → 30 → 25, ...), since most
 * approvals land on a round quarter- or half-hour. Both fields stay
 * directly editable by typing — the buttons are a shortcut, not the only way
 * in — and, like the box this replaces, only commit on blur/Enter so a
 * partly-typed value never gets mangled by a mid-edit round-trip.
 */
export function HHMMField({ minutes, onCommit, className = '', 'aria-label': ariaLabel }) {
  const total = minutes || 0;
  const [h, setH] = useState(() => String(Math.floor(total / 60)));
  const [m, setM] = useState(() => String(total % 60));

  useEffect(() => {
    setH(String(Math.floor((minutes || 0) / 60)));
    setM(String((minutes || 0) % 60));
  }, [minutes]);

  const commitHourEdit = () => onCommit(clamp0((parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0)));
  const commitMinEdit = () => {
    const mins = Math.min(59, Math.max(0, parseInt(m, 10) || 0));
    onCommit(clamp0((parseInt(h, 10) || 0) * 60 + mins));
  };

  const onKeyDown = (e) => { if (e.key === 'Enter') e.currentTarget.blur(); };

  return (
    <div className={`ot-time-stepper ${className}`}>
      <div className="ot-step-group">
        <input
          type="text" inputMode="numeric" value={h}
          onChange={(e) => setH(e.target.value.replace(/\D/g, ''))}
          onBlur={commitHourEdit} onKeyDown={onKeyDown}
          aria-label={`${ariaLabel || 'Time'} — hours`}
        />
        <div className="ot-step-btns">
          <button type="button" tabIndex={-1} onClick={() => onCommit(clamp0(total + 60))} aria-label="Add 1 hour"><ChevronUp size={10} /></button>
          <button type="button" tabIndex={-1} onClick={() => onCommit(clamp0(total - 60))} aria-label="Subtract 1 hour"><ChevronDown size={10} /></button>
        </div>
      </div>
      <span className="ot-step-sep">h</span>
      <div className="ot-step-group">
        <input
          type="text" inputMode="numeric" value={m}
          onChange={(e) => setM(e.target.value.replace(/\D/g, ''))}
          onBlur={commitMinEdit} onKeyDown={onKeyDown}
          aria-label={`${ariaLabel || 'Time'} — minutes`}
        />
        <div className="ot-step-btns">
          <button type="button" tabIndex={-1} onClick={() => onCommit(snapUp5(total))} aria-label="Round up 5 minutes"><ChevronUp size={10} /></button>
          <button type="button" tabIndex={-1} onClick={() => onCommit(snapDown5(total))} aria-label="Round down 5 minutes"><ChevronDown size={10} /></button>
        </div>
      </div>
      <span className="ot-step-sep">m</span>
    </div>
  );
}
