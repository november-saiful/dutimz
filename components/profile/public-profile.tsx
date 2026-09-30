"use client";

import * as React from "react";

import { StoryCard } from "@/components/dashboard/story-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { reportError } from "@/lib/errors";
import { supabaseBrowser, type Story } from "@/lib/supabase";

type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
};

export function PublicProfile({ username }: { username: string }) {
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [stories, setStories] = React.useState<Story[]>([]);
  const [status, setStatus] = React.useState<"loading" | "ready" | "missing">(
    "loading",
  );
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{2,23}$/.test(username)) {
        setStatus("missing");
        setMessage("ইউজারনেমটি সঠিক নয়।");
        return;
      }
      try {
        const supabase = supabaseBrowser();
        const result = await supabase
          .from("profiles")
          .select("id,username,display_name,bio,avatar_url")
          .eq("username", username)
          .maybeSingle();
        if (cancelled) return;
        if (result.error || !result.data) {
          if (result.error) reportError("public profile", result.error);
          setStatus("missing");
          setMessage(
            result.error
              ? "প্রোফাইলটি এখন লোড করা যাচ্ছে না।"
              : "এই ইউজারনেমে কোনো প্রকাশ্য প্রোফাইল নেই।",
          );
          return;
        }
        const found = result.data as Profile;
        setProfile(found);
        document.title = `${found.display_name || `@${found.username}`} | DUTIMZ`;
        const feed = await supabase
          .from("articles")
          .select(
            "id,slug,title,excerpt,published_at,is_anonymous,hero_media_key,category:categories(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name,avatar_url)",
          )
          .eq("author_id", found.id)
          .eq("status", "published")
          .order("published_at", { ascending: false })
          .limit(30);
        if (cancelled) return;
        if (feed.error) {
          reportError("public profile stories", feed.error);
          setStories([]);
          setStatus("ready");
          return;
        }
        setStories((feed.data as unknown as Story[]) ?? []);
        setStatus("ready");
      } catch (err) {
        reportError("public profile", err);
        if (!cancelled) {
          setStatus("missing");
          setMessage("প্রোফাইলটি এখন লোড করা যাচ্ছে না।");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-16" />
      </div>
    );
  }

  if (status === "missing" || !profile) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <strong>প্রোফাইল পাওয়া যায়নি</strong>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  const display =
    profile.display_name?.trim() || `@${profile.username || "পাঠক"}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-4">
        <Avatar className="size-16">
          {profile.avatar_url && (
            <AvatarImage src={profile.avatar_url} alt="" />
          )}
          <AvatarFallback className="text-xl">ঢা</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            DUTIMZ সদস্য
          </p>
          <h1 className="text-2xl font-bold">{display}</h1>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
        </div>
      </header>
      <p className="text-sm text-muted-foreground">
        {profile.bio || "ঢাকা বিশ্ববিদ্যালয়ের পাঠক ও লেখক।"}
      </p>
      <section aria-labelledby="public-stories-heading">
        <h2 id="public-stories-heading" className="mb-3 text-xl font-semibold">
          প্রকাশিত প্রতিবেদন
        </h2>
        {stories.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {stories.map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            এখনো প্রকাশিত প্রতিবেদন নেই।
          </div>
        )}
      </section>
    </div>
  );
}
