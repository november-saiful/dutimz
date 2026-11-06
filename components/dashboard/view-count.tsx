"use client";

import * as React from "react";
import { Eye } from "lucide-react";

import { requestFeedViews } from "@/lib/feed-views";
import { bn } from "@/lib/site";

/**
 * The card's view total: the cached page's number first, then the current one.
 *
 * The server renders this into a page that is revalidated every five minutes, so the figure is
 * a snapshot. On mount — and again when the browser restores the page from its back/forward
 * cache — the card asks for the same batched summary and swaps in the live total, so a reader
 * who just opened a story sees its card move without waiting for the next regeneration.
 */
export function FeedViewCount({
  articleId,
  initial,
}: {
  articleId: string;
  initial: number;
}) {
  const [views, setViews] = React.useState(initial);

  React.useEffect(() => {
    let live = true;
    const refresh = () => {
      void requestFeedViews([articleId]).then((counts) => {
        const next = counts.get(articleId);
        if (live && typeof next === "number") setViews(next);
      });
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [articleId]);

  return (
    <span className="news-score">
      <Eye size={13} strokeWidth={2.2} aria-hidden />
      {bn(views)}
    </span>
  );
}
