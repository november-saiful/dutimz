"use client";

import * as React from "react";

import { rememberReturnPath, signInWithGoogle } from "@/lib/auth-client";
import { errorMessage, reportError } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type ArticleActionsProps = {
  articleId: string;
  articleTitle: string;
  /** Absolute canonical URL of the story, for the share buttons. */
  articleUrl?: string;
  correctionSubject: string;
  /**
   * "chips" (default) is the reading bar's row of counters — likes, saves and
   * the jump to the comments. "socials" is the share row beside the tags.
   */
  variant?: "chips" | "socials";
};

export function ArticleActions({
  articleId,
  articleTitle,
  articleUrl,
  correctionSubject,
  variant = "chips",
}: ArticleActionsProps) {
  const [likes, setLikes] = React.useState<number | null>(null);
  const [comments, setComments] = React.useState<number | null>(null);
  const [reacted, setReacted] = React.useState(false);
  const [bookmarked, setBookmarked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: stats, error: statsError } = await supabase.rpc("get_article_stats", {
          p_article_id: articleId,
        });
        if (statsError) {
          setNotice(errorMessage("article stats", statsError, "পছন্দের সংখ্যা লোড করা যায়নি।"));
        }
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          setNotice(errorMessage("article actions session", authError, "অ্যাকাউন্ট যাচাই করা যায়নি। আবার চেষ্টা করুন।"));
        }
        if (cancelled) return;
        const likesCount = (stats as { likes?: number } | null)?.likes ?? 0;
        setLikes(likesCount);
        setComments((stats as { comments?: number } | null)?.comments ?? 0);
        if (authError || !user) return;
        const { data: reactions, error: reactionsError } = await supabase
          .from("reactions")
          .select("reaction")
          .eq("article_id", articleId)
          .eq("user_id", user.id);
        if (reactionsError) {
          setNotice(errorMessage("article reaction state", reactionsError, "আপনার প্রতিক্রিয়া লোড করা যায়নি।"));
          return;
        }
        if (!cancelled) setReacted(Boolean(reactions?.length));
        const { data: saved, error: savedError } = await supabase
          .from("bookmarks")
          .select("article_id")
          .eq("article_id", articleId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (savedError) {
          setNotice(errorMessage("article bookmark state", savedError, "সংরক্ষণের অবস্থা লোড করা যায়নি।"));
          return;
        }
        if (!cancelled) setBookmarked(Boolean(saved));
      } catch (err) {
        reportError("article actions", err);
        if (!cancelled) setLikes(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  async function requireUser() {
    const supabase = supabaseBrowser();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) {
      // No sign-in page: the gated action starts the Google flow immediately and
      // returns the reader to this article afterwards.
      rememberReturnPath();
      setNotice("এই সুবিধাটি ব্যবহার করতে গুগল দিয়ে প্রবেশ করুন।");
      const { error: oauthError } = await signInWithGoogle();
      if (oauthError) throw oauthError;
      return null;
    }
    return { supabase, user };
  }

  async function toggleReaction() {
    if (busy) return;
    setBusy(true);
    try {
      const session = await requireUser();
      if (!session) return;
      const { supabase, user } = session;
      const result = reacted
        ? await supabase
            .from("reactions")
            .delete()
            .eq("article_id", articleId)
            .eq("user_id", user.id)
            .eq("reaction", "like")
        : await supabase.from("reactions").insert({
            article_id: articleId,
            user_id: user.id,
            reaction: "like",
          });
      if (result.error) {
        setNotice(
          errorMessage(
            "reaction",
            result.error,
            "প্রতিক্রিয়া সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      setReacted(!reacted);
      setLikes((count) => Math.max(0, (count ?? 0) + (reacted ? -1 : 1)));
    } catch (err) {
      setNotice(errorMessage("reaction", err, "প্রতিক্রিয়া সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBookmark() {
    if (busy) return;
    setBusy(true);
    try {
      const session = await requireUser();
      if (!session) return;
      const { supabase, user } = session;
      const result = bookmarked
        ? await supabase
            .from("bookmarks")
            .delete()
            .eq("article_id", articleId)
            .eq("user_id", user.id)
        : await supabase
            .from("bookmarks")
            .insert({ article_id: articleId, user_id: user.id });
      if (result.error) {
        setNotice(
          errorMessage(
            "bookmark",
            result.error,
            "সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      setBookmarked(!bookmarked);
      setNotice(
        bookmarked
          ? "সংরক্ষিত তালিকা থেকে সরানো হয়েছে।"
          : "প্রতিবেদনটি সংরক্ষণ করা হয়েছে।",
      );
    } catch (err) {
      setNotice(errorMessage("bookmark", err, "সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: articleTitle, url: articleUrl ?? location.href });
      } catch {
        /* the reader dismissed the share sheet — not a failure */
      }
    } else {
      await navigator.clipboard?.writeText(articleUrl ?? location.href);
      setNotice("প্রতিবেদনের লিংক কপি করা হয়েছে।");
    }
  }

  const correctionHref = `mailto:corrections@dutimz.com?subject=${encodeURIComponent(correctionSubject)}`;
  const shareHref = articleUrl ?? "";
  const countLabel = (count: number | null) => count === null ? "…" : new Intl.NumberFormat("bn-BD").format(count);

  if (variant === "socials") {
    return (
      <div>
        <div className="socials">
          <a
            href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareHref)}&text=${encodeURIComponent(articleTitle)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X-এ শেয়ার করুন"
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M22 5.8c-.7.3-1.5.6-2.3.7a4 4 0 0 0 1.7-2.2c-.8.5-1.6.8-2.5 1a4 4 0 0 0-6.9 3.6A11.3 11.3 0 0 1 3.9 4.7a4 4 0 0 0 1.2 5.3c-.6 0-1.3-.2-1.8-.5v.1a4 4 0 0 0 3.2 3.9 4 4 0 0 1-1.8.1 4 4 0 0 0 3.7 2.8A8 8 0 0 1 2 18.1a11.3 11.3 0 0 0 6.1 1.8c7.4 0 11.4-6.1 11.4-11.4v-.5c.8-.6 1.5-1.3 2-2.2z" />
            </svg>
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareHref)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="ফেসবুকে শেয়ার করুন"
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M14 9h3l-.4 3H14v9h-3v-9H8V9h3V7.5A3.5 3.5 0 0 1 14.5 4H17v3h-2.5a.5.5 0 0 0-.5.5V9z" />
            </svg>
          </a>
          <button type="button" onClick={share} aria-label="লিংক শেয়ার করুন">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M18 8a3 3 0 1 0-2.8-4H15a3 3 0 0 0 .1 1.3L8.9 8.4a3 3 0 1 0 0 7.2l6.2 3.1A3 3 0 1 0 18 16c-.8 0-1.5.3-2 .8l-6-3a3 3 0 0 0 0-1.6l6-3c.5.5 1.2.8 2 .8z" />
            </svg>
          </button>
          <a href={correctionHref} aria-label="সংশোধন জানান">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M3 5h18v14H3z" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M3 6l9 7 9-7" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </a>
        </div>
        {notice && (
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            {notice}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bar-chips">
      <button
        type="button"
        className={cn("chip", reacted && "liked")}
        onClick={toggleReaction}
        disabled={busy}
        aria-pressed={reacted}
        aria-label="ভালো লেগেছে"
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
        <b>{countLabel(likes)}</b>
      </button>
      <button
        type="button"
        className={cn("chip", bookmarked && "liked")}
        onClick={toggleBookmark}
        disabled={busy}
        aria-pressed={bookmarked}
        aria-label={bookmarked ? "সংরক্ষিত" : "সংরক্ষণ করুন"}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M6 3h12v18l-6-4.5L6 21z" />
        </svg>
        <b>{bookmarked ? "সংরক্ষিত" : "সংরক্ষণ"}</b>
      </button>
      <a className="chip" href="#comments" aria-label="মন্তব্যে যান">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <b>{countLabel(comments)}</b>
      </a>
      {notice && (
        <span role="status" className="sr-only">
          {notice}
        </span>
      )}
    </div>
  );
}
