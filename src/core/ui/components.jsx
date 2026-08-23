import { useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';
import './components.css';

/**
 * Back-button handling for any overlay (sheets, full-screen detail views).
 *
 * Every overlay pushes a history entry when it opens so the phone's back
 * button pops that entry and closes the overlay instead of navigating away
 * from the module. The tricky part is STACKING: a Sheet opened on top of
 * another overlay, or on top of a full-screen detail view. When the top
 * overlay closes it calls history.back(), which fires a popstate on the one
 * underneath too.
 *
 * The fix: each overlay tags its pushed state with a unique id. In popstate,
 * `e.state` is the state we LANDED ON after the pop — if that's still our own
 * entry, something above us was popped and we must stay open. We only close
 * when we land somewhere that isn't us (meaning our own entry was the one
 * removed). This is the single mechanism behind every "pressing back / opening
 * a card bounces me out of the module" fix in the app.
 *
 * Exported so full-screen overlays that aren't <Sheet>s (payment history,
 * report preview, note editor) share the exact same, correct behaviour.
 */
let _overlaySeq = 0;
const _overlayStack = [];
export function useBackClose(onClose) {
  const closedByBack = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Cancels a cleanup's deferred history.back() if the effect immediately
  // re-runs — see the comment on `return` below for why this exists.
  const pendingBack = useRef(null);

  useEffect(() => {
    // If a StrictMode remount is cancelling the previous pass's deferred
    // back(), that pass's pushState() already happened for real — cancelling
    // the pop just avoided undoing it at the wrong moment, it didn't undo the
    // push itself. Pushing AGAIN here would leave that entry permanently
    // orphaned (nothing left ever pops it), silently growing history by one
    // extra level per overlay open for the life of the dev session, until a
    // later close()'s single back() lands one level short and closes the
    // wrong thing. Reusing the slot via replaceState keeps exactly one real
    // history entry per logical open, dev-mode double-invoke or not.
    const reusingSlot = !!pendingBack.current;
    if (pendingBack.current) {
      clearTimeout(pendingBack.current);
      pendingBack.current = null;
    }

    const myId = ++_overlaySeq;
    _overlayStack.push(myId);
    if (reusingSlot) window.history.replaceState({ overlay: myId }, '');
    else window.history.pushState({ overlay: myId }, '');

    const onPop = (e) => {
      const landed = e.state;
      if (landed && landed.overlay === myId) return; // still us on top
      closedByBack.current = true;
      onCloseRef.current();
    };
    // Escape closes only the topmost overlay, so stacked sheets (a card with
    // an edit form over it) don't all collapse at once.
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (_overlayStack[_overlayStack.length - 1] !== myId) return;
      onCloseRef.current();
    };

    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    document.body.classList.add('swipe-locked');

    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      const i = _overlayStack.lastIndexOf(myId);
      if (i !== -1) _overlayStack.splice(i, 1);
      if (_overlayStack.length === 0) {
        document.body.style.overflow = '';
        document.body.classList.remove('swipe-locked');
      }
      // Deferred, not called inline: React StrictMode double-invokes this
      // effect on mount (cleanup, then immediately re-run) to check for
      // non-idempotent effects. Calling history.back() synchronously here
      // races the very next mount's pushState — back() lands asynchronously,
      // AFTER the remount has already pushed a new entry, so it pops the
      // wrong one and closes the sheet that just opened. Deferring by a
      // tick lets the immediate remount above cancel this before it fires;
      // a genuine unmount lets it through unchanged.
      if (!closedByBack.current) {
        pendingBack.current = setTimeout(() => {
          pendingBack.current = null;
          try { window.history.back(); } catch { /* ok */ }
        }, 0);
      }
      closedByBack.current = false;
    };
  }, []);
}

export function Button({ variant = 'quiet', size = 'md', children, ...rest }) {
  return (
    <button className={`btn btn-${variant} btn-${size}`} {...rest}>
      {children}
    </button>
  );
}

export function Card({ children, className = '', ...rest }) {
  return <div className={`card ${className}`} {...rest}>{children}</div>;
}

export function SectionLabel({ children, right }) {
  return (
    <div className="section-label">
      <span className="eyebrow">{children}</span>
      {right}
    </div>
  );
}

/**
 * A single ruled line in the daybook. Every module renders items as these.
 *
 * Note the hit area: a row can be clickable AND contain a checkbox or an icon
 * button. Wrapping the whole row in a <button> would nest interactive elements,
 * which is invalid and breaks keyboard navigation. Instead a stretched button
 * (or anchor, when `href` is passed) sits behind the content, the text layer
 * ignores pointer events, and the real controls sit above it.
 */
/**
 * `accent` on its own draws nothing now — a categorical color-code on every
 * row (a left bar, then a soft edge glow) turned out to be more decoration
 * than signal. It only shows up when paired with `wash`: a state actually
 * worth noticing at a glance (e.g. a due/overdue reminder) gets a tinted
 * fill plus a glowing border in that color, not a left-edge treatment.
 */
export function Row({ accent, wash, lead, title, meta, right, onClick, href, target, rel, muted, dim, children }) {
  const clickable = onClick || href;
  const highlight = wash && accent;
  return (
    <div
      className={`row ${muted ? 'row-muted' : ''} ${dim ? 'row-dim' : ''} ${clickable ? 'row-clickable' : ''} ${highlight ? 'row-wash' : ''}`}
      style={highlight ? {
        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
        boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 40%, transparent), 0 0 14px -3px color-mix(in srgb, ${accent} 65%, transparent)`,
      } : undefined}
    >
      {clickable && (href ? (
        <a
          className="row-hit"
          href={href}
          target={target}
          rel={rel}
          onClick={onClick}
          aria-label={typeof title === 'string' ? title : 'Open'}
        />
      ) : (
        <button
          type="button"
          className="row-hit"
          onClick={onClick}
          aria-label={typeof title === 'string' ? title : 'Open'}
        />
      ))}
      {lead && <span className="row-lead">{lead}</span>}
      <span className="row-body">
        <span className="row-title">{title}</span>
        {meta && <span className="row-meta">{meta}</span>}
        {children}
      </span>
      {right && <span className="row-right">{right}</span>}
    </div>
  );
}

export function Checkbox({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`checkbox ${checked ? 'is-on' : ''}`}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
    >
      {checked && <Check size={13} strokeWidth={3} />}
    </button>
  );
}

/**
 * A right-aligned completion control — replaces the old left-side Checkbox
 * for reminders and to-do list items. Deliberately doesn't do anything to
 * the row's text itself (no strikethrough): pair it with `dim` on the
 * enclosing Row so the whole line just greys, keeping text left-aligned
 * and every control on the right.
 */
export function CompleteButton({ completed, onToggle, doneLabel = 'Completed', label = 'Complete' }) {
  return (
    <button
      type="button"
      className={`complete-btn ${completed ? 'is-done' : ''}`}
      aria-pressed={completed}
      aria-label={completed ? `Mark ${label.toLowerCase()} not done` : `Mark ${label.toLowerCase()} done`}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      {completed ? <><Check size={12} strokeWidth={2.5} /> {doneLabel}</> : label}
    </button>
  );
}

export function Chip({ children, tone = 'neutral', onClick }) {
  const Tag = onClick ? 'button' : 'span';
  return <Tag type={onClick ? 'button' : undefined} className={`chip chip-${tone}`} onClick={onClick}>{children}</Tag>;
}

/** The switch from the settings screens. */
export function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

/** A labelled row with a control on the right — the settings list primitive. */
export function OptionRow({ title, hint, control, icon: Icon, iconColor }) {
  return (
    <div className="option-row">
      {Icon && <Icon size={17} strokeWidth={1.8} style={{ color: iconColor || 'var(--muted)', marginTop: 1, flex: 'none' }} />}
      <span className="option-body">
        <span className="option-title">{title}</span>
        {hint && <span className="option-hint">{hint}</span>}
      </span>
      <span className="option-control">{control}</span>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      {label && <span className="eyebrow">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Input(props) { return <input className="input" {...props} />; }
export function Select(props) { return <select className="input" {...props} />; }
export function Textarea(props) { return <textarea className="input textarea" {...props} />; }

/** Bottom sheet on mobile, centred panel on wider screens. */
export function Sheet({ open, onClose, title, children, footer, headerActions }) {
  // Gate the hook-bearing body on `open` at the wrapper so the history entry
  // is pushed exactly for the sheet's open lifetime (hooks can't be conditional
  // inside one component, so the split is deliberate).
  if (!open) return null;
  return <SheetBody onClose={onClose} title={title} footer={footer} headerActions={headerActions}>{children}</SheetBody>;
}

/**
 * Keeps a fixed-position overlay (and its footer/save button) above the
 * on-screen keyboard, WITHOUT touching the page's viewport globally — that
 * was tried via a `interactive-widget=resizes-content` meta tag, but that
 * moves every fixed-position element on the page (the tab bar included),
 * not just the overlay in question. Scoped to whichever element's ref is
 * passed in instead: visualViewport already tracks the keyboard's true
 * occupied height live, including unpredictable extras like Gboard's
 * autofill/suggestion strip appearing after the keyboard is already up, so
 * no guessing at a fixed height is needed. Apply the resulting --kb-inset
 * custom property as bottom padding on that element.
 *
 * Exported for overlays that can't use <Sheet> itself (its own back-button
 * history timing races against some overlays' needs — see Assistant.jsx)
 * but have the same bottom-anchored-behind-the-keyboard problem.
 */
export function useKeyboardInset(ref) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !ref.current) return;
    const node = ref.current;
    const update = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // innerHeight/visualViewport report unzoomed px, but this value is
      // applied inside html{zoom:.9} (phone widths, see tokens.css) where
      // every CSS px renders at 0.9x — measured: a 100px box paints as 90px.
      // Without dividing it back out, the inset lands ~10% short and the
      // footer stays partly under the keyboard.
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      node.style.setProperty('--kb-inset', `${covered / zoom}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    // A field focused right as the sheet opens (autoFocus, most often the
    // first field) can request the keyboard before it's finished animating
    // in — the visualViewport resize event that update() waits for isn't
    // guaranteed to land after that settles on every device, and when it
    // doesn't, --kb-inset stays stuck at 0 and the footer ends up hidden
    // under the keyboard for the rest of the sheet's life. Re-running update()
    // a few times shortly after any focus inside the sheet catches it up
    // regardless of whether that event ever fires.
    const onFocusIn = () => [50, 150, 300, 500].forEach((ms) => setTimeout(update, ms));
    node.addEventListener('focusin', onFocusIn);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      node.removeEventListener('focusin', onFocusIn);
    };
  }, [ref]);
}

function SheetBody({ onClose, title, children, footer, headerActions }) {
  useBackClose(onClose);
  const scrimRef = useRef(null);
  useKeyboardInset(scrimRef);
  return (
    <div className="sheet-scrim" ref={scrimRef} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2 className="sheet-title serif">{title}</h2>
          <div className="sheet-head-actions">
            {headerActions}
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** An empty screen is an invitation to act, so it always carries the action. */
export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="empty">
      {Icon && <Icon size={22} strokeWidth={1.6} />}
      <p className="empty-title serif">{title}</p>
      {body && <p className="empty-body">{body}</p>}
      {action}
    </div>
  );
}
