/**
 * Phase 4 Bookmark toggle — saves/removes articles from the user's bookmarks.
 *
 * Bookmarks live per account in Supabase, so the button resolves its own state:
 * on mount it asks GET /api/bookmarks (which answers 401 when signed out) and
 * renders a sign-in hint instead of a dead toggle. The `isLoggedIn` prop can
 * still be passed by a parent that already knows the answer.
 */
"use client";

import { useState, useEffect, useCallback } from "react";


const COPY = { saved: "সংরক্ষিত", unsaved: "সংরক্ষণ করুন", loginRequired: "লগইন করুন" } as const;

export function BookmarkButton({
  contentId,
  initialBookmarked = false,
  isLoggedIn,
}: {
  contentId: string;
  initialBookmarked?: boolean;
  /** `true`/`false` when the parent knows; omit to let the button ask the API. */
  isLoggedIn?: boolean;
}) {
  const t = COPY;
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [loading, setLoading] = useState(false);
  // null = still resolving whether there is a session.
  const [authed, setAuthed] = useState<boolean | null>(isLoggedIn ?? null);

  useEffect(() => {
    if (isLoggedIn !== undefined || authed !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/bookmarks");
        if (cancelled) return;
        if (res.status === 401) {
          setAuthed(false);
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as { contentIds?: string[] };
          if (cancelled) return;
          setBookmarked((data.contentIds ?? []).includes(contentId));
          setAuthed(true);
          return;
        }
        setAuthed(false);
      } catch {
        if (!cancelled) setAuthed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contentId, isLoggedIn, authed]);

  const handleToggle = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId }),
      });
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setBookmarked(Boolean(data.bookmarked));
      }
    } finally {
      setLoading(false);
    }
  }, [contentId, authed]);

  if (authed === false) {
    return (
      <span className="text-xs opacity-40" title={t.loginRequired}>
        🔖 {t.loginRequired}
      </span>
    );
  }

  if (authed === null) {
    // Session still being resolved — keep the layout stable, no misleading CTA.
    return <span className="text-xs opacity-30" aria-hidden="true">🔖</span>;
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
        bookmarked ? "opacity-100" : "opacity-60 hover:opacity-100"
      }`}
      style={{
        background: bookmarked ? "var(--md-sys-color-primary-container)" : "transparent",
      }}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? t.saved : t.unsaved}
    >
      {bookmarked ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      )}
      {bookmarked ? t.saved : t.unsaved}
    </button>
  );
}
