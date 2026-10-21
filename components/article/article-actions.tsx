"use client";

import * as React from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
   * "chips" (default) is the reading bar's row of counters — votes, saves and
   * the jump to the comments. "socials" is the share row beside the tags.
   */
  variant?: "chips" | "socials";
};

type Vote = "up" | "down" | null;

/**
 * Any legacy reaction (`like`, `insightful`, `support`) counts as an upvote:
 * the migration folds them into `up`, but a database it has not reached yet
 * still reports them.
 */
function reactionToVote(reaction: string | null | undefined): Vote {
  if (reaction === "down") return "down";
  if (!reaction) return null;
  return "up";
}

export function ArticleActions({
  articleId,
  articleTitle,
  articleUrl,
  correctionSubject,
  variant = "chips",
}: ArticleActionsProps) {
  const [score, setScore] = React.useState<number | null>(null);
  const [comments, setComments] = React.useState<number | null>(null);
  const [myVote, setMyVote] = React.useState<Vote>(null);
  const [bookmarked, setBookmarked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  /*
   * A signed-out press on a vote button opens the sign-in popover instead of
   * sending the reader to Google unannounced. `target` keeps which direction
   * was pressed — it is still wanted once the reader returns from signing in.
   */
  const [gateOpen, setGateOpen] = React.useState(false);
  const gateTarget = React.useRef<"up" | "down">("up");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: stats, error: statsError } = await supabase.rpc("get_article_stats", {
          p_article_id: articleId,
        });
        if (statsError) {
          setNotice(errorMessage("article stats", statsError, "ভোটের সংখ্যা লোড করা যায়নি।"));
        }
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          setNotice(errorMessage("article actions session", authError, "অ্যাকাউন্ট যাচাই করা যায়নি। আবার চেষ্টা করুন।"));
        }
        if (cancelled) return;
        const typed = stats as { score?: number; upvotes?: number; downvotes?: number; likes?: number } | null;
        const resolved =
          typeof typed?.score === "number"
            ? typed.score
            : (typed?.upvotes ?? typed?.likes ?? 0) - (typed?.downvotes ?? 0);
        setScore(resolved);
        setComments((stats as { comments?: number } | null)?.comments ?? 0);
        if (authError || !user) return;
        const { data: reactions, error: reactionsError } = await supabase
          .from("reactions")
          .select("reaction")
          .eq("article_id", articleId)
          .eq("user_id", user.id);
        if (reactionsError) {
          setNotice(errorMessage("article reaction state", reactionsError, "আপনার ভোট লোড করা যায়নি।"));
          return;
        }
        const votes = (reactions ?? []).map((row) => reactionToVote((row as { reaction?: string }).reaction));
        if (!cancelled) setMyVote(votes.includes("up") ? "up" : votes.includes("down") ? "down" : null);
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
        if (!cancelled) setScore(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  /** A vote has one precondition: a reader. A signed-out press opens the prompt. */
  async function vote(target: "up" | "down") {
    if (busy) return;
    const supabase = supabaseBrowser();
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!user) {
        // Reopening the popover on every press is smoother than a toast the
        // reader has to hunt for; the press is remembered for the later attempt.
        rememberReturnPath();
        gateTarget.current = target;
        setGateOpen(true);
        return;
      }
      await proceedWithVote(supabase, user.id, target);
    } catch (err) {
      setNotice(errorMessage("vote", err, "ভোট সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
    }
  }

  async function proceedWithVote(
    supabase: ReturnType<typeof supabaseBrowser>,
    userId: string,
    target: "up" | "down",
  ) {
    if (busy) return;
    setBusy(true);
    try {
      const previous = myVote;
      // One vote per reader: clear every row for this article first. This also
      // sweeps away legacy duplicate reactions from before the vote migration.
      const cleared = await supabase
        .from("reactions")
        .delete()
        .eq("article_id", articleId)
        .eq("user_id", userId);
      if (cleared.error) {
        setNotice(
          errorMessage(
            "vote",
            cleared.error,
            "ভোট সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      if (previous !== target) {
        const inserted = await supabase.from("reactions").insert({
          article_id: articleId,
          user_id: userId,
          reaction: target,
        });
        if (inserted.error) {
          setNotice(
            errorMessage(
              "vote",
              inserted.error,
              "ভোট সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
            ),
          );
          return;
        }
      }
      const next: Vote = previous === target ? null : target;
      setMyVote(next);
      // The cleared state is neutral (0 from this reader), so the delta is just
      // the new vote's value minus the old vote's value.
      const valueOf = (voteState: Vote) => (voteState === "up" ? 1 : voteState === "down" ? -1 : 0);
      setScore((count) => (count ?? 0) + (valueOf(next) - valueOf(previous)));
      setNotice("");
    } catch (err) {
      setNotice(errorMessage("vote", err, "ভোট সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(false);
    }
  }

  async function signInFromGate() {
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        setNotice(errorMessage("vote sign-in", error, "প্রবেশ করা যায়নি। আবার চেষ্টা করুন।"));
        setGateOpen(false);
      }
      // On success the browser leaves for Google; no cleanup here.
    } catch (err) {
      reportError("vote sign-in", err);
      setNotice(errorMessage("vote sign-in", err, "প্রবেশ করা যায়নি। আবার চেষ্টা করুন।"));
      setGateOpen(false);
    }
  }

  async function toggleBookmark() {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!user) {
        rememberReturnPath();
        setGateOpen(true);
        return;
      }
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
      <div
        className={cn("vote-cluster", myVote === "up" && "voted-up", myVote === "down" && "voted-down")}
        role="group"
        aria-label="প্রতিবেদনে ভোট দিন"
      >
        <button
          type="button"
          className="vote-btn"
          onClick={() => vote("up")}
          disabled={busy}
          aria-pressed={myVote === "up"}
          aria-label={myVote === "up" ? "আপভোট সরান" : "আপভোট দিন"}
        >
          <ArrowBigUp className="size-5" />
        </button>
        <b className="vote-score" aria-live="polite" aria-label={`${countLabel(score)} স্কোর`}>
          {countLabel(score)}
        </b>
        <button
          type="button"
          className="vote-btn"
          onClick={() => vote("down")}
          disabled={busy}
          aria-pressed={myVote === "down"}
          aria-label={myVote === "down" ? "ডাউনভোট সরান" : "ডাউনভোট দিন"}
        >
          <ArrowBigDown className="size-5" />
        </button>
        <Popover open={gateOpen} onOpenChange={setGateOpen}>
          <PopoverTrigger className="sr-only" aria-hidden tabIndex={-1} />
          <PopoverContent className="w-64 border-border text-popover-foreground">
            <p className="text-sm font-medium">ভোট দিতে প্রথমে প্রবেশ করুন</p>
            <p className="mt-1 text-xs text-muted-foreground">
              গুগল দিয়ে প্রবেশ করলে আপনার ভোটই এই প্রতিবেদনে গোনা হবে।
            </p>
            <button
              type="button"
              onClick={() => void signInFromGate()}
              className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              গুগল দিয়ে প্রবেশ করুন
            </button>
          </PopoverContent>
        </Popover>
      </div>
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
