"use client";

import * as React from "react";
import { Bookmark, Heart, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase";

export function ArticleActions({
  articleId,
  articleTitle,
  correctionSubject,
}: {
  articleId: string;
  articleTitle: string;
  correctionSubject: string;
}) {
  const [likes, setLikes] = React.useState<number | null>(null);
  const [reacted, setReacted] = React.useState(false);
  const [bookmarked, setBookmarked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: stats } = await supabase.rpc("get_article_stats", {
          p_article_id: articleId,
        });
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        const likesCount = (stats as { likes?: number } | null)?.likes ?? 0;
        setLikes(likesCount);
        if (!user) return;
        const { data: reactions } = await supabase
          .from("reactions")
          .select("reaction")
          .eq("article_id", articleId)
          .eq("user_id", user.id);
        if (!cancelled) setReacted(Boolean(reactions?.length));
        const { data: saved } = await supabase
          .from("bookmarks")
          .select("article_id")
          .eq("article_id", articleId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled) setBookmarked(Boolean(saved));
      } catch {
        if (!cancelled) setLikes(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  async function requireUser() {
    const supabase = supabaseBrowser();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      sessionStorage.setItem(
        "dutimz-after-auth",
        `${location.pathname}${location.search}`,
      );
      setNotice("এই সুবিধাটি ব্যবহার করতে গুগল দিয়ে প্রবেশ করুন।");
      window.setTimeout(() => window.location.assign("/auth/sign-in"), 550);
      return null;
    }
    return { supabase, user };
  }

  async function toggleReaction() {
    const session = await requireUser();
    if (!session || busy) return;
    setBusy(true);
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
    setBusy(false);
    if (result.error) {
      setNotice(result.error.message);
      return;
    }
    setReacted(!reacted);
    setLikes((count) => Math.max(0, (count ?? 0) + (reacted ? -1 : 1)));
  }

  async function toggleBookmark() {
    const session = await requireUser();
    if (!session || busy) return;
    setBusy(true);
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
    setBusy(false);
    if (result.error) {
      setNotice(result.error.message);
      return;
    }
    setBookmarked(!bookmarked);
    setNotice(
      bookmarked
        ? "সংরক্ষিত তালিকা থেকে সরানো হয়েছে।"
        : "প্রতিবেদনটি সংরক্ষণ করা হয়েছে।",
    );
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: articleTitle, url: location.href });
      } catch {
        /* dismissed */
      }
    } else {
      await navigator.clipboard?.writeText(location.href);
      setNotice("প্রতিবেদনের লিংক কপি করা হয়েছে।");
    }
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
          <a
            href={`mailto:corrections@dutimz.com?subject=${encodeURIComponent(correctionSubject)}`}
          >
            সংশোধন জানান
          </a>
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
