/**
 * Detects a right-swipe gesture starting within 24 px of the left edge of the
 * viewport. When the gesture completes (finger lifts) the callback fires.
 *
 * Works on both touch and pointer devices; ignores horizontal scrolls that
 * move more than 50 px vertically (to avoid conflicts with page scrolling).
 */
"use client";

import { useEffect, useRef } from "react";

const EDGE_THRESHOLD = 24; // px from left edge to start gesture
const MIN_SWIPE = 50; // minimum horizontal distance to count as swipe
const MAX_VERTICAL = 50; // cancel if finger moves too far vertically

export function useSwipeDrawer(onSwipe: () => void) {
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  useEffect(() => {
    const el = document.getElementById("main-content");
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX <= EDGE_THRESHOLD) {
        tracking.current = true;
        startX.current = t.clientX;
        startY.current = t.clientY;
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking.current) return;
      tracking.current = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX.current;
      const dy = Math.abs(t.clientY - startY.current);
      if (dx >= MIN_SWIPE && dy < MAX_VERTICAL) {
        onSwipe();
      }
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dy = Math.abs(t.clientY - startY.current);
      if (dy > MAX_VERTICAL) {
        tracking.current = false;
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchmove", onMove);
    };
  }, [onSwipe]);
}
