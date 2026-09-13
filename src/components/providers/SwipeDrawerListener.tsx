"use client";

import { useCallback } from "react";
import { useSwipeDrawer } from "@/hooks/useSwipeDrawer";
import { useUIStore } from "@/stores/ui";

/**
 * Attaches a swipe-from-right-edge gesture to the main content area so mobile
 * users can pull open the navigation drawer without reaching for the hamburger
 * button. Rendered once near the root layout.
 */
export function SwipeDrawerListener() {
  const openMobileMenu = useUIStore((s) => s.openMobileMenu);

  const onSwipe = useCallback(() => {
    openMobileMenu();
  }, [openMobileMenu]);

  useSwipeDrawer(onSwipe);

  return (
    <div
      className="swipe-indicator pointer-events-none tablet:hidden"
      aria-hidden="true"
    />
  );
}
