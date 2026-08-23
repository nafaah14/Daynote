import { useRef, useState } from 'react';

/**
 * Per-row swipe-to-complete. No reusable per-row swipe pattern exists
 * elsewhere in the app (core/shell/useSwipeNav.js is page-level tab
 * navigation, a different thing) — this is a small pointer-event gesture
 * scoped to one row: drag left past THRESHOLD and release to fire
 * `onComplete`; anything short of that snaps back to rest.
 *
 * `wasSwipe()` exists because the DOM still fires a `click` right after
 * `pointerup` even when the pointer clearly dragged — checking React's
 * `dragging` state inside that click handler doesn't work, since `dragging`
 * is already reset to false by the time click fires (pointerup runs first,
 * setting it false, then click runs against the post-update render). A
 * ref that's only cleared on the *next* pointerdown survives past the
 * click, so the row's own onClick can tell a genuine drag from a tap.
 */
const THRESHOLD = 80; // px before a release counts as "complete"
const MOVED = 8;      // px before a gesture counts as a drag at all, not a tap
const MAX_DRAG = 120; // px the row is allowed to travel
const MAX_TIME = 800; // ms — a slow drag still counts (unlike swipe-nav, this isn't a flick)

export function useSwipeToComplete(onComplete) {
  const startRef = useRef(null);
  const movedRef = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e) => {
    if (!e.isPrimary) return;
    startRef.current = { x: e.clientX, at: Date.now() };
    movedRef.current = false;
    setDragging(true);
  };

  const onPointerMove = (e) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    if (Math.abs(dx) > MOVED) movedRef.current = true;
    setDragX(Math.max(-MAX_DRAG, Math.min(0, dx))); // left-only, clamped
  };

  const endSwipe = () => {
    const started = startRef.current;
    startRef.current = null;
    setDragging(false);
    const shouldComplete = started && (Date.now() - started.at) <= MAX_TIME && dragX <= -THRESHOLD;
    setDragX(0);
    if (shouldComplete) onComplete();
  };

  return {
    dragX,
    dragging,
    revealed: Math.min(1, -dragX / THRESHOLD),
    wasSwipe: () => movedRef.current,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endSwipe,
      onPointerCancel: endSwipe,
    },
  };
}
