/**
 * Phase 4 Bookmark toggle — saves/removes articles from the user's bookmarks.
 * Shows filled icon when bookmarked, outline when not. Bilingual labels.
 */
"use client";

import { useState, useCallback } from "react";
import { useLocaleStore } from "@/stores/locale";

const COPY = {
  bn: { saved: "সংরক্ষিত", unsaved: "সংরক্ষণ করুন", loginRequired: "লগইন করুন" },
  en: { saved: "Saved", unsaved: "Save", loginRequired: "Log in to save" },
} as const;

export function BookmarkButton({
  contentId,
  initialBookmarked = false,
  isLoggedIn = false,
}: {
  contentId: string;
  initialBookmarked?: boolean;
  isLoggedIn?: boolean;
}) {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale];
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [loading, setLoading] = useState(false);

  const handleToggle = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId }),
      });
      if (res.ok) {
        const data = await res.json();
        setBookmarked(data.bookmarked);
      }
    } finally {
      setLoading(false);
    }
  }, [contentId, isLoggedIn]);

  if (!isLoggedIn) {
    return (
      <span className="text-xs opacity-40" title={t.loginRequired}>
        🔖 {t.loginRequired}
      </span>
    );
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
