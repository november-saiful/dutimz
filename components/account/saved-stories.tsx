"use client";

import Link from "next/link";
import * as React from "react";

import { StoryCard } from "@/components/dashboard/story-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { one, supabaseBrowser, type Story } from "@/lib/supabase";

export function SavedStories() {
  const [state, setState] = React.useState<
    "loading" | "signed-out" | "ready" | "error"
  >("loading");
  const [stories, setStories] = React.useState<Story[]>([]);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const {
          data: { user },
        } = await supabase.auth.getUser();
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
          .limit(60);
        if (cancelled) return;
        if (result.error) {
          setState("error");
          setMessage(result.error.message);
          return;
        }
        const articles = (result.data ?? [])
          .map((item) =>
            one(
              (item as { articles: Story | Story[] | null }).articles,
            ),
          )
          .filter((item): item is Story => item !== null);
        setStories(articles);
        setState("ready");
      } catch (err) {
        if (!cancelled) {
          setState("error");
          setMessage(err instanceof Error ? err.message : "লোড করা যায়নি।");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (state === "signed-out") {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-3 pt-6">
          <strong>সংরক্ষিত খবর দেখতে প্রবেশ করুন</strong>
          <p className="text-sm text-muted-foreground">
            বুকমার্ক করা খবর আপনার অ্যাকাউন্টের সঙ্গে সংরক্ষিত থাকে।
          </p>
          <Button asChild>
            <Link href="/auth/sign-in">গুগল দিয়ে প্রবেশ করুন →</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state === "error") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          সংরক্ষিত প্রতিবেদন লোড করা যায়নি: {message}
        </CardContent>
      </Card>
    );
  }

  if (!stories.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-lg">
            ▱
          </span>
          <strong>এখনো কোনো প্রতিবেদন সংরক্ষণ করেননি</strong>
          <p className="text-sm text-muted-foreground">
            খবরের পাতায় বুকমার্ক চিহ্ন চাপলে সেটি এখানে পাবেন।
          </p>
          <Button variant="link" asChild>
            <Link href="/">খবর পড়ুন →</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {stories.map((story) => (
        <StoryCard key={story.id} story={story} />
      ))}
    </div>
  );
}
