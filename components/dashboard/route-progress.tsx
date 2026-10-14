"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

/**
 * The thin brand bar at the very top edge while the reader moves between pages.
 *
 * Page changes here are server renders (the article, section and profile pages
 * all read the database), so a tap can sit on a frozen page for a beat with no
 * feedback. This bar is that feedback: any tap on an internal destination shows
 * it at once, and the pathname change that lands the new page hides it again.
 *
 * No animation library, no router events to subscribe to — Next's App Router
 * exposes neither — just a capturing click listener (Next's own `Link` renders
 * a plain anchor, so one listener covers both) and the pathname as the ground
 * truth for arrival. A four-second timeout covers the case where the
 * destination never changes the pathname (a failed render, an aborted load):
 * the bar must never stick.
 */
export function RouteProgress() {
  const pathname = usePathname() ?? "/";
  const [travelling, setTravelling] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setTravelling(false);
  }, []);

  // Arrival: the address changed, so whatever render the bar was covering for
  // has landed (or at least started landing).
  React.useEffect(() => {
    stop();
  }, [pathname, stop]);

  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      // New tabs, new windows and downloads are not page changes in this tab.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      // External destinations, mail, same-page hashes and blank targets never
      // change this tab's pathname, so the bar would have nothing to wait for.
      if (
        anchor.hasAttribute("download") ||
        anchor.getAttribute("target") === "_blank" ||
        anchor.getAttribute("rel")?.includes("external") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#") ||
        /^[a-z][a-z0-9+.-]*:/i.test(href)
      ) {
        return;
      }
      setTravelling(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(stop, 4000);
    }
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [stop]);

  if (!travelling) return null;
  return <div className="route-progress" aria-hidden="true" />;
}
