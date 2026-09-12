/**
 * Phase 5 Service Worker Registrar — registers /sw.js on client mount.
 * Only runs in production (not dev) to avoid caching issues.
 */
"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Check for updates periodically
        setInterval(() => reg.update(), 60 * 60 * 1000); // hourly
      })
      .catch(() => {
        // SW registration failed — non-critical, silently ignore
      });
  }, []);

  return null;
}
