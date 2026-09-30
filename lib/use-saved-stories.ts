"use client";

import * as React from "react";

import { errorMessage } from "@/lib/errors";
import {
  isSupabaseConfigured,
  one,
  supabaseBrowser,
  type Story,
} from "@/lib/supabase";

export type SavedStoriesState = "loading" | "signed-out" | "ready" | "error";

const LOAD_FAILED = "সংরক্ষিত প্রতিবেদন লোড করা যায়নি। আবার চেষ্টা করুন।";

/**
 * The reader's bookmarks, shared by the /saved page and the header popover so
 * the query shape and its states live in one place. `limit` bounds how many are
 * fetched — the header preview wants only a handful.
 */
export function useSavedStories(limit = 60) {
  const [state, setState] = React.useState<SavedStoriesState>("loading");
  const [stories, setStories] = React.useState<Story[]>([]);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      /*
        Demo and pull-request previews run without Supabase credentials, and
        supabaseBrowser() throws in that case. Treat that as "signed out" so the
        reader sees the sign-in prompt rather than a configuration error.
      */
      if (!isSupabaseConfigured()) {
        if (!cancelled) setState("signed-out");
        return;
      }
      try {
        const supabase = supabaseBrowser();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          setState("error");
          setMessage(errorMessage("saved stories session", authError, LOAD_FAILED));
          return;
        }
        if (cancelled) return;
        if (!user) {
          setState("signed-out");
          return;
        }
        const result = await supabase
          .from("bookmarks")
          .select(
            "articles:articles!bookmarks_article_id_fkey(id,slug,title,excerpt,published_at,is_anonymous,hero_media_key,category:categories(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name,avatar_url))",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (cancelled) return;
        if (result.error) {
          setState("error");
          setMessage(errorMessage("saved stories", result.error, LOAD_FAILED));
          return;
        }
        const articles = (result.data ?? [])
          .map((item) =>
            one((item as { articles: Story | Story[] | null }).articles),
          )
          .filter((item): item is Story => item !== null);
        setStories(articles);
        setState("ready");
      } catch (err) {
        if (!cancelled) {
          setState("error");
          setMessage(errorMessage("saved stories", err, LOAD_FAILED));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { state, stories, message };
}
