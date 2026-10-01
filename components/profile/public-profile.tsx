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
  avatar_url: string | null;
  bio: string | null;
  department: string | null;
  session: string | null;
  hall_name: string | null;
  residency_status: string | null;
  show_published_stories: boolean;
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
        // Only the fields the member marked public come back; hidden ones are null.
        const result = await supabase.rpc("get_public_profile", {
          p_username: username,
        });
        if (cancelled) return;
        if (result.error) {
          reportError("public profile", result.error);
          setStatus("missing");
          setMessage("প্রোফাইলটি এখন লোড করা যাচ্ছে না।");
          return;
        }
        const found = (Array.isArray(result.data)
          ? result.data[0]
          : result.data) as Profile | undefined;
        if (!found) {
          setStatus("missing");
          setMessage("এই ইউজারনেমে কোনো প্রকাশ্য প্রোফাইল নেই।");
          return;
        }
        setProfile(found);
        document.title = `${found.display_name || `@${found.username}`} | DUTIMZ`;
        if (!found.show_published_stories) {
          setStories([]);
          setStatus("ready");
          return;
        }
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
  const facts = [
    profile.department ? { label: "বিভাগ", value: profile.department } : null,
    profile.session ? { label: "সেশন", value: profile.session } : null,
    profile.hall_name ? { label: "হল", value: profile.hall_name } : null,
    profile.residency_status
      ? {
          label: "আবাসিক অবস্থা",
          value:
            profile.residency_status === "hall_resident"
              ? "হল-আবাসিক"
              : "ক্যাম্পাসের বাইরে",
        }
      : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));

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
      {profile.bio ? (
        <p className="text-sm text-muted-foreground">{profile.bio}</p>
      ) : null}
      {facts.length > 0 && (
        <dl className="grid gap-3 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="text-sm font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {profile.show_published_stories && (
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
      )}
    </div>
  );
}
