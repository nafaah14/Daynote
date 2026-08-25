import { useState, useRef, useCallback, useEffect } from 'react';
import { GripVertical, Plus, Pin, PinOff } from 'lucide-react';
import './extras.css';

/**
 * Small icon-triggered dropdown — a button that reveals a menu on tap,
 * closing on an outside click. Originally local to the Notes editor
 * (rich-text toolbar popovers); promoted here once the pin control below
 * needed the exact same interaction in four other modules.
 */
export function Popover({ icon: Icon, label, align = 'right', preserveSelection, children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const guard = preserveSelection ? { onMouseDown: (e) => e.preventDefault() } : {};

  return (
    <div className="rt-pop-wrap" ref={wrapRef}>
      <button type="button" className={`rt-btn ${open ? 'is-on' : ''}`}
        aria-label={label} title={label} {...guard} onClick={() => setOpen((o) => !o)}>
        <Icon size={16} />
      </button>
      {open && (
        <div className={`rt-pop rt-pop-${align}`} {...guard}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

/**
 * Floating action button, bottom-right, above the tab bar.
 *
 * Modules put their primary action (usually "new") here rather than in the
 * page header, so it's within thumb reach on a phone — the same reasoning as
 * Google Keep's compose button. `icon` defaults to a plus; a module whose
 * primary action isn't adding can pass a different one.
 */
export function Fab({ onClick, label = 'New', icon: Icon = Plus, className = '' }) {
  return (
    <button className={`fab ${className}`} onClick={onClick} aria-label={label} title={label}>
      <Icon size={24} strokeWidth={2.2} />
    </button>
  );
}

/**
 * Show-on-Dashboard control — a compact icon + dropdown, same format as the
 * Notes editor's own pin button (which is where this pattern started).
 * Replaces the old always-expanded segmented-control banner: same
 * `home` field on every record, same three states, far less space.
 *
 *   auto   — follow the module's rule (due today, has open items, …)
 *   pinned — always shown, even when the rule wouldn't pick it
 *   hidden — kept out of Dashboard entirely; stays in its own module
 */
export function PinMenu({ value = 'auto', onChange, autoLabel }) {
  const choices = [
    { id: 'auto', label: autoLabel ? `Auto — ${autoLabel}` : 'Auto' },
    { id: 'pinned', label: 'Always pinned' },
    { id: 'hidden', label: 'Never' },
  ];
  return (
    <Popover icon={value === 'hidden' ? PinOff : Pin} label="Show on Dashboard" align="right">
      {(close) => (
        <div className="rt-menu">
          {choices.map((c) => (
            <button
              key={c.id} type="button"
              className={`rt-menu-item ${value === c.id ? 'is-on' : ''}`}
              onClick={() => { onChange(c.id); close(); }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
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
