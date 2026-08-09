import { useState, useRef, useCallback } from 'react';
import { GripVertical, Plus } from 'lucide-react';
import './extras.css';

/**
 * Floating action button, bottom-right, above the tab bar.
 *
 * Modules put their primary action (usually "new") here rather than in the
 * page header, so it's within thumb reach on a phone — the same reasoning as
 * Google Keep's compose button. `icon` defaults to a plus; Today passes a
 * search icon instead, since its primary action is to find, not to add.
 */
export function Fab({ onClick, label = 'New', icon: Icon = Plus, className = '' }) {
  return (
    <button className={`fab ${className}`} onClick={onClick} aria-label={label} title={label}>
      <Icon size={24} strokeWidth={2.2} />
    </button>
  );
}

/**
 * Show-on-Today control.
 *
 * `home` is a field on the record envelope, so this one control works for
 * every module — lists, reminders, notes, and anything built later. Modules
 * drop it into their editor and never think about Today again.
 *
 *   auto   — follow the module's rule (due today, has open items, …)
 *   always — pin it, even when the rule wouldn't pick it
 *   never  — keep it out of Today entirely; it stays in its own module
 */
const OPTIONS = [
  { id: 'auto', label: 'Auto' },
  { id: 'pinned', label: 'Always' },
  { id: 'hidden', label: 'Never' },
];

export function HomeVisibility({ value = 'auto', onChange, autoHint }) {
  return (
    <div className="field">
      <span className="eyebrow">Show on Today</span>
      <div className="segmented" role="radiogroup" aria-label="Show on Today">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            className={`segment ${value === o.id ? 'is-on' : ''}`}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <span className="field-hint">
        {value === 'auto' && (autoHint || 'Appears when it needs your attention.')}
        {value === 'pinned' && 'Always at the top of Today.'}
        {value === 'hidden' && "Never on Today — it stays here in its own module."}
      </span>
    </div>
  );
}

/**
 * Drag-to-reorder list.
 *
 * Pointer events so mouse and touch behave identically, and `touch-action:
 * none` lives on the grip alone so the rest of the row still scrolls the page
 * on a phone. Same approach as the roster, pulled into core so Settings and
 * any future module share one implementation.
 */
export function ReorderList({ items, onReorder, renderItem, disabled }) {
  const refs = useRef(new Map());
  const [drag, setDrag] = useState(null);

  const setRef = useCallback((id) => (el) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  }, []);

  const begin = (e, id) => {
    if (disabled || !e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id, order: items.map((i) => i.id) });
    document.body.classList.add('dragging-active');
  };

  const move = (e) => {
    if (!drag) return;
    e.preventDefault();
    const y = e.clientY;
    const rest = drag.order.filter((id) => id !== drag.id);
    let at = rest.length;
    for (let i = 0; i < rest.length; i++) {
      const el = refs.current.get(rest[i]);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) { at = i; break; }
    }
    const next = [...rest];
    next.splice(at, 0, drag.id);
    const same = next.every((id, i) => id === drag.order[i]);
    if (!same) setDrag({ ...drag, order: next });
  };

  const end = () => {
    if (!drag) return;
    onReorder(drag.order);
    setDrag(null);
    document.body.classList.remove('dragging-active');
  };

  const shown = drag
    ? drag.order.map((id) => items.find((i) => i.id === id)).filter(Boolean)
    : items;

  return (
    <div className="ruled" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {shown.map((item) => (
        <div
          key={item.id}
          ref={setRef(item.id)}
          className={`reorder-row ${drag?.id === item.id ? 'is-dragging' : ''}`}
        >
          <button
            className="grip"
            aria-label={`Reorder ${item.label || ''}`}
            onPointerDown={(e) => begin(e, item.id)}
            disabled={disabled}
          >
            <GripVertical size={16} strokeWidth={1.7} />
          </button>
          <div className="reorder-body">{renderItem(item)}</div>
        </div>
      ))}
    </div>
  );
}
