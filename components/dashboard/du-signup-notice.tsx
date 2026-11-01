"use client";

import * as React from "react";

/**
 * The OAuth callback cannot speak for itself: the exchange happens on the server and the browser
 * lands wherever it is sent. A denied sign-up is sent home with `?signup=du-only`, and this
 * strip says why. It reads the address bar directly — not `useSearchParams` — because the pages
 * it sits on are prerendered, and a hook that needs the request's query string would pull them
 * out of the cache.
 */
export function DuSignupNotice() {
  const [denied, setDenied] = React.useState(false);

  React.useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("signup") === "du-only") {
        setDenied(true);
      }
    } catch {
      /* an unreadable address is not worth a banner */
    }
  }, []);

  if (!denied) return null;

  function dismiss() {
    setDenied(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("signup");
      window.history.replaceState(null, "", url.pathname + url.search);
    } catch {
      /* the parameter stays behind, but the banner is already gone */
    }
  }

  return (
    <div role="status" className="border-b border-border bg-muted">
      <div className="mx-auto flex max-w-[var(--maxw)] items-center justify-between gap-3 px-7 py-2.5 text-sm">
        <p className="min-w-0">
          কেবল ঢাকা বিশ্ববিদ্যালয়ের ইমেইল দিয়ে অ্যাকাউন্ট খোলা যায় — ঠিকানা{" "}
          du.ac.bd দিয়ে শেষ হতে হয় (যেমন @du.ac.bd বা @mgt.du.ac.bd)। আপনার
          বিভাগের ইমেইল দিয়ে আবার চেষ্টা করুন।
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="বন্ধ করুন"
          className="shrink-0 rounded-md px-2 py-1 text-muted-foreground hover:bg-background hover:text-foreground"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
