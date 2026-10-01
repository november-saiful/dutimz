"use client";

import * as React from "react";
import { Bookmark, Heart, Plus, Share2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { rememberReturnPath, signInWithGoogle } from "@/lib/auth-client";
import { errorMessage, reportError } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type ArticleActionsProps = {
  articleId: string;
  articleTitle: string;
  correctionSubject: string;
  /**
   * "inline" (default) is the row of actions; "floating" is the phone-only
   * single call to action that unfolds the same actions when tapped.
   */
  variant?: "inline" | "floating";
};

export function ArticleActions({
  articleId,
  articleTitle,
  correctionSubject,
  variant = "inline",
}: ArticleActionsProps) {
  const [likes, setLikes] = React.useState<number | null>(null);
  const [reacted, setReacted] = React.useState(false);
  const [bookmarked, setBookmarked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [open, setOpen] = React.useState(false);

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
        await navigator.share({ title: articleTitle, url: location.href });
      } catch {
        /* the reader dismissed the share sheet — not a failure */
      }
    } else {
      await navigator.clipboard?.writeText(location.href);
      setNotice("প্রতিবেদনের লিংক কপি করা হয়েছে।");
    }
  }

  const likeLabel = `${likes === null ? "…" : new Intl.NumberFormat("bn-BD").format(likes)} ভালো লেগেছে`;
  const correctionHref = `mailto:corrections@dutimz.com?subject=${encodeURIComponent(correctionSubject)}`;

  /*
    Phones get one floating call to action instead of a bar of four buttons: the
    round button unfolds the same actions, so the article body stays clear while
    every action is still one tap away. Desktop keeps the inline row.
  */
  if (variant === "floating") {
    return (
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 lg:hidden">
        {open && (
          <>
            <button
              type="button"
              aria-label="কার্যক্রম বন্ধ করুন"
              className="fixed inset-0 -z-10 cursor-default bg-background/40 backdrop-blur-[1px]"
              onClick={() => setOpen(false)}
            />
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={toggleReaction}
                disabled={busy}
                aria-pressed={reacted}
                className={cn(
                  "flex items-center gap-2 rounded-full border bg-background px-3.5 py-2 text-sm font-medium shadow-sm",
                  reacted && "border-primary text-primary",
                )}
              >
                <Heart className={cn("size-4", reacted && "fill-current")} />
                {likeLabel}
              </button>
              <button
                type="button"
                onClick={toggleBookmark}
                disabled={busy}
                aria-pressed={bookmarked}
                className={cn(
                  "flex items-center gap-2 rounded-full border bg-background px-3.5 py-2 text-sm font-medium shadow-sm",
                  bookmarked && "border-primary text-primary",
                )}
              >
                <Bookmark className={cn("size-4", bookmarked && "fill-current")} />
                {bookmarked ? "সংরক্ষিত" : "সংরক্ষণ"}
              </button>
              <button
                type="button"
                onClick={share}
                className="flex items-center gap-2 rounded-full border bg-background px-3.5 py-2 text-sm font-medium shadow-sm"
              >
                <Share2 className="size-4" />
                শেয়ার করুন
              </button>
              <a
                href={correctionHref}
                className="flex items-center gap-2 rounded-full border bg-background px-3.5 py-2 text-sm font-medium shadow-sm"
              >
                সংশোধন জানান
              </a>
            </div>
            {notice && (
              <p
                className="max-w-[16rem] rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm"
                role="status"
              >
                {notice}
              </p>
            )}
          </>
        )}
        <Button
          type="button"
          size="icon"
          aria-expanded={open}
          aria-label={open ? "কার্যক্রম বন্ধ করুন" : "প্রতিবেদনের কার্যক্রম"}
          onClick={() => setOpen((current) => !current)}
          className="size-14 rounded-full shadow-lg"
        >
          {open ? <X className="size-6" /> : <Plus className="size-6" />}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={reacted ? "default" : "outline"}
          size="sm"
          onClick={toggleReaction}
          disabled={busy}
          aria-pressed={reacted}
        >
          <Heart className="mr-1 size-4" />
          {likes === null ? "…" : new Intl.NumberFormat("bn-BD").format(likes)}{" "}
          ভালো লেগেছে
        </Button>
        <Button
          variant={bookmarked ? "default" : "outline"}
          size="sm"
          onClick={toggleBookmark}
          disabled={busy}
          aria-pressed={bookmarked}
        >
          <Bookmark className="mr-1 size-4" />
          {bookmarked ? "সংরক্ষিত" : "সংরক্ষণ"}
        </Button>
        <Button variant="outline" size="sm" onClick={share}>
          <Share2 className="mr-1 size-4" />
          শেয়ার করুন
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={correctionHref}>সংশোধন জানান</a>
        </Button>
      </div>
      {notice && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
