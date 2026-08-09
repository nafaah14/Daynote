import { useEffect, useRef } from 'react';

/**
 * Swipe left/right to move between the bottom-bar sections.
 *
 * The hard part isn't the gesture, it's knowing when NOT to claim it. A swipe
 * has to be ignored when it starts inside something that scrolls sideways
 * (the filter pills, the settings tabs, a wide table) or while a drag is in
 * progress, otherwise reordering the roster would fling you into another
 * module. So: bail on those, and only act on a gesture that is clearly
 * horizontal and clearly deliberate.
 */

const DISTANCE = 70;      // px before it counts as a swipe
const RATIO = 1.7;        // how much more horizontal than vertical it must be
const MAX_TIME = 600;     // ms — a slow drag is not a swipe

/** Does the touch start inside something the user might be scrolling sideways? */
function insideHorizontalScroller(el, root) {
  let node = el;
  while (node && node !== root) {
    if (node.dataset?.noSwipe !== undefined) return true;
    if (node.scrollWidth > node.clientWidth + 4) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function useSwipeNav(ref, { onPrev, onNext, enabled = true }) {
  const start = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const blocked = () => {
      if (document.body.classList.contains('dragging-active')) return true;
      if (document.body.classList.contains('swipe-locked')) return true;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return true;
      }
      return false;
    };

    const onStart = (e) => {
      if (e.touches.length !== 1) { start.current = null; return; }
      // An open editor, focus in a text field, or an active drag all mean the
      // person is mid-action — never navigate out from under them.
      if (blocked()) { start.current = null; return; }
      const t = e.touches[0];
      if (insideHorizontalScroller(e.target, el)) { start.current = null; return; }
      start.current = { x: t.clientX, y: t.clientY, at: Date.now() };
    };

    const onEnd = (e) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      // Re-check at the END too: a Sheet may have opened, or a field focused,
      // between touchstart and touchend. Without this a gesture begun on the
      // bare page can still complete a navigation after an action started.
      if (blocked()) return;

      const t = e.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;

      if (Date.now() - s.at > MAX_TIME) return;
      if (Math.abs(dx) < DISTANCE) return;
      if (Math.abs(dx) < Math.abs(dy) * RATIO) return;   // too vertical

      if (dx < 0) onNext(); else onPrev();
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', () => { start.current = null; }, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [ref, onPrev, onNext, enabled]);
}
