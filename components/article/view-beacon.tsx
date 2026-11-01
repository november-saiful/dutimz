"use client";

import { useEffect, useRef } from "react";

import { supabaseBrowser } from "@/lib/supabase";
import { DEMO_MODE } from "@/lib/site";

const VIEWER_ID_KEY = "dutimz-viewer-id";

/*
  The one shot a reading page takes at recording a view.

  The page itself is cached and may be served hours after it was rendered, so the count cannot be
  taken server-side; this fires from the reader's browser instead. It waits a few seconds so a
  bounce or a preload costs nothing, sends a device id rather than any personal data, and skips the
  author's own signed-in visits — the database applies the same exclusion, this only saves the
  round trip.
*/
export function ViewBeacon({
  articleId,
  authorId,
}: {
  articleId: string;
  authorId: string | null;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (DEMO_MODE) return;
    const timer = window.setTimeout(async () => {
      if (fired.current) return;
      fired.current = true;
      try {
        if (authorId) {
          const { data } = await supabaseBrowser().auth.getSession();
          if (data.session?.user?.id === authorId) return;
        }
        await fetch("/api/views", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId, vid: viewerId() }),
        });
      } catch {
        // A lost beacon costs one view, never the page.
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [articleId, authorId]);

  return null;
}

function viewerId(): string {
  try {
    const existing = window.localStorage.getItem(VIEWER_ID_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.localStorage.setItem(VIEWER_ID_KEY, id);
    return id;
  } catch {
    // Storage can be unavailable (private windows, full quotas); a per-load id still counts once.
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
