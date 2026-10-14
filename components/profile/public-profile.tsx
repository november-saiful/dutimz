"use client";

import Link from "next/link";
import * as React from "react";
import {
  Building2,
  CalendarDays,
  GraduationCap,
  Home,
  Layers,
} from "lucide-react";

import { StoryArt } from "@/components/dashboard/story-card";
import {
  EntryDot,
  ProfileBand,
  ProfileEntry,
  ProfileKicker,
  ProfileMeta,
  ProfileSectionHead,
  ProfileSideBlock,
  ProfileStats,
} from "@/components/profile/profile-pieces";
import { Skeleton } from "@/components/ui/skeleton";
import { reportError } from "@/lib/errors";
import { previewMember, previewStories } from "@/lib/preview";
import { bn, formatDateBn, mediaUrlFor, roleTitle } from "@/lib/site";
import {
  isSupabaseConfigured,
  storyCategory,
  supabaseBrowser,
  type Story,
} from "@/lib/supabase";

/*
 * A member's public page: `/u/<handle>/`.
 *
 * It is the reference design's editorial profile — a band, the identity over its
 * foot, a hairline row of what the member lets the campus see, a strip of real
 * numbers and then their reporting — drawn from the one read the page takes:
 * `get_public_profile` hands back only the fields the member marked public
 * (every other one arrives null, so a hidden field cannot leak by being
 * rendered), and the articles query behind it asks for that member's published
 * work.
 *
 * Two consequences of the design worth naming:
 *
 *  - The numbers are counted from those two reads, not invented. `count: "exact"`
 *    on the articles query is the total the strip prints while the list below
 *    shows the newest of them, so "১২৪টি প্রতিবেদন" and five rows can both be
 *    true at once;
 *  - Nothing here is a card. The reference page reads as a page — hairlines,
 *    rules and one dark block — so the site's Card primitive is not used on it.
 */

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  cover_url: string | null;
  /** The desk's role for this member, named in the kicker above their name. */
  role: string | null;
  bio: string | null;
  department: string | null;
  session: string | null;
  hall_name: string | null;
  residency_status: string | null;
  show_published_stories: boolean;
};

/** One report, flattened from either the database or the preview fixture. */
type ListedStory = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category: string;
  categorySlug: string;
  publishedAt: string | null;
  image: string | null;
};

function listedFromStory(story: Story): ListedStory {
  const category = storyCategory(story);
  return {
    id: story.id,
    slug: story.slug,
    title: story.title,
    excerpt: story.excerpt,
    category: category.title_bn,
    categorySlug: category.slug,
    publishedAt: story.published_at,
    image: story.hero_media_key ? mediaUrlFor(story.hero_media_key) : null,
  };
}

function listedFromPreview(
  story: (typeof previewStories)[number],
  index: number,
): ListedStory {
  return {
    id: `${story.slug}-${index}`,
    slug: story.slug,
    title: story.title,
    excerpt: story.excerpt,
    category: story.category,
    categorySlug: story.categorySlug,
    publishedAt: null,
    image: story.imageUrl ?? null,
  };
}

const RESIDENCY_LABELS: Record<string, string> = {
  hall_resident: "হল-আবাসিক",
  outside: "ক্যাম্পাসের বাইরে",
};

export function PublicProfile({ username }: { username: string }) {
  const demo = !isSupabaseConfigured();
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [stories, setStories] = React.useState<ListedStory[]>([]);
  const [totalReports, setTotalReports] = React.useState(0);
  const [desk, setDesk] = React.useState("all");
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
      /*
        A build with no credentials has no profiles to read, so the preview member
        stands in for the one handle the fixture owns. Any other handle still gets
        the not-found page: a preview must not hand every address the same face.
      */
      if (demo) {
        if (username !== previewMember.username) {
          setStatus("missing");
          setMessage("এই ইউজারনেমে কোনো প্রকাশ্য প্রোফাইল নেই।");
          return;
        }
        const listed = previewStories.map(listedFromPreview);
        setProfile({
          id: "preview",
          username: previewMember.username,
          display_name: previewMember.displayName,
          avatar_url: null,
          cover_url: null,
          role: previewMember.role,
          bio: previewMember.bio,
          department: previewMember.department,
          session: previewMember.session,
          hall_name: previewMember.hallName,
          residency_status: previewMember.residency,
          show_published_stories: true,
        });
        setStories(listed);
        setTotalReports(listed.length);
        setStatus("ready");
        document.title = `${previewMember.displayName} | DUTIMZ`;
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
          setTotalReports(0);
          setStatus("ready");
          return;
        }
        const feed = await supabase
          .from("articles")
          .select(
            "id,slug,title,excerpt,published_at,is_anonymous,hero_media_key,category:categories(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name,avatar_url)",
            // The strip prints this total; the list below shows the newest of it.
            { count: "exact" },
          )
          .eq("author_id", found.id)
          .eq("status", "published")
          .order("published_at", { ascending: false })
          .limit(30);
        if (cancelled) return;
        if (feed.error) {
          reportError("public profile stories", feed.error);
          setStories([]);
          setTotalReports(0);
          setStatus("ready");
          return;
        }
        const rows = ((feed.data as unknown as Story[]) ?? []).map(
          listedFromStory,
        );
        setStories(rows);
        setTotalReports(feed.count ?? rows.length);
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
  }, [username, demo]);

  if (status === "loading") {
    return (
      <div className="pf-page">
        <ProfileBand tag="সদস্য পরিচিতি" />
        <header className="pf-head">
          <Skeleton className="size-[152px] rounded-full" />
          <div className="pf-body">
            <Skeleton className="mb-3 h-4 w-32" />
            <Skeleton className="mb-4 h-12 w-72" />
            <Skeleton className="mb-3 h-4 w-56" />
            <Skeleton className="h-20 w-full" />
          </div>
        </header>
        <div className="pf-list">
          <Skeleton className="my-6 h-28 w-full" />
          <Skeleton className="my-6 h-28 w-full" />
        </div>
      </div>
    );
  }

  if (status === "missing" || !profile) {
    return (
      <div className="pf-page">
        <ProfileBand tag="সদস্য পরিচিতি" />
        <div className="pf-layout">
          <div className="pf-main">
            <ProfileSectionHead title="প্রোফাইল পাওয়া যায়নি" sub="৪০৪" />
            <p className="pf-note">
              {message} মিলিয়ে দেখুন ইউজারনেমটি ঠিক আছে কি না, অথবা{" "}
              <Link href="/">মূলপাতায় ফিরে যান</Link>।
            </p>
          </div>
        </div>
      </div>
    );
  }

  const display =
    profile.display_name?.trim() || `@${profile.username || "পাঠক"}`;
  const facts = [
    profile.department && {
      icon: GraduationCap,
      label: "বিভাগ",
      value: profile.department,
    },
    profile.session && {
      icon: CalendarDays,
      label: "সেশন",
      value: profile.session,
    },
    profile.hall_name && {
      icon: Building2,
      label: "হল",
      value: profile.hall_name,
    },
    profile.residency_status && {
      icon: Home,
      label: "আবাসিক অবস্থা",
      value: RESIDENCY_LABELS[profile.residency_status] ?? profile.residency_status,
    },
  ].filter(
    (fact): fact is { icon: typeof GraduationCap; label: string; value: string } =>
      Boolean(fact),
  );

  // The desks this member writes for, counted from their own published reports:
  // their beats, stated as the sections a reader can go and read.
  const deskCounts = new Map<
    string,
    { slug: string; label: string; count: number }
  >();
  for (const story of stories) {
    const current = deskCounts.get(story.categorySlug);
    if (current) current.count += 1;
    else
      deskCounts.set(story.categorySlug, {
        slug: story.categorySlug,
        label: story.category,
        count: 1,
      });
  }
  const desks = [...deskCounts.values()];

  const shown = desk === "all" ? stories : stories.filter((s) => s.categorySlug === desk);
  const withArt = stories.filter((story) => story.image).length;
  const latest = stories[0]?.publishedAt ?? null;

  return (
    <div className="pf-page">
      <ProfileBand tag="সদস্য পরিচিতি" cover={profile.cover_url} />
      <header className="pf-head">
        <span className="pf-avatar">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" />
          ) : (
            <span aria-hidden>{display.slice(0, 1)}</span>
          )}
        </span>
        <div className="pf-body">
          <ProfileKicker>{`DUTIMZ ${roleTitle(profile.role)}`}</ProfileKicker>
          <h1 className="pf-name">{display}</h1>
          <p className="pf-role">
            @{profile.username}
            {profile.department ? (
              <>
                {" · "}
                <b>{profile.department}</b>
              </>
            ) : null}
          </p>
          {profile.bio ? <p className="pf-bio">{profile.bio}</p> : null}
          <ProfileMeta
            items={facts.map((fact) => ({ icon: fact.icon, text: fact.value }))}
          />
        </div>
      </header>

      <ProfileStats
        stats={[
          { value: bn(totalReports), label: "প্রকাশিত প্রতিবেদন" },
          { value: bn(desks.length), label: "ডেস্ক" },
          { value: bn(withArt), label: "ছবিসহ প্রতিবেদন" },
          {
            value: latest ? formatDateBn(latest) : "—",
            label: "সর্বশেষ প্রকাশ",
          },
        ]}
      />

      <div className="pf-layout">
        <section className="pf-main" aria-labelledby="public-stories-heading">
          <ProfileSectionHead
            id="public-stories-heading"
            title="প্রকাশিত প্রতিবেদন"
            sub={profile.show_published_stories ? "নতুন আগে" : "প্রকাশ্য নয়"}
          />
          {!profile.show_published_stories ? (
            <p className="pf-note">
              সদস্য তাঁর প্রকাশিত প্রতিবেদন এই পাতায় দেখাতে চাননি।
            </p>
          ) : stories.length === 0 ? (
            <p className="pf-note">এখনো প্রকাশিত প্রতিবেদন নেই।</p>
          ) : (
            <>
              {desks.length > 1 ? (
                <div className="pf-chips" role="group" aria-label="ডেস্ক অনুযায়ী ছাঁকন">
                  <button
                    type="button"
                    className={`pf-chip${desk === "all" ? " active" : ""}`}
                    aria-pressed={desk === "all"}
                    onClick={() => setDesk("all")}
                  >
                    সব ডেস্ক
                  </button>
                  {desks.map((entry) => (
                    <button
                      key={entry.slug}
                      type="button"
                      className={`pf-chip${desk === entry.slug ? " active" : ""}`}
                      aria-pressed={desk === entry.slug}
                      onClick={() => setDesk(entry.slug)}
                    >
                      {entry.label} ({bn(entry.count)})
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="pf-list">
                {shown.map((story) => (
                  <ProfileEntry
                    key={story.id}
                    href={`/news/${encodeURIComponent(story.slug)}/`}
                    category={story.category}
                    title={story.title}
                    excerpt={story.excerpt}
                    art={
                      <StoryArt
                        slug={story.categorySlug}
                        imageUrl={story.image}
                        title={story.title}
                        className="absolute inset-0"
                      />
                    }
                    meta={
                      <>
                        <time dateTime={story.publishedAt ?? undefined}>
                          {story.publishedAt
                            ? formatDateBn(story.publishedAt)
                            : "প্রিভিউ"}
                        </time>
                        <EntryDot />
                        <span>{story.image ? "ছবিসহ" : "লেখা"}</span>
                      </>
                    }
                  />
                ))}
              </div>
            </>
          )}
        </section>

        <aside>
          <ProfileSideBlock icon={Layers} label="যেসব ডেস্কে লিখেছেন">
            {desks.length > 0 ? (
              <div className="pf-tags">
                {desks.map((entry) => (
                  <span className="pf-tag" key={entry.slug}>
                    {entry.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="pf-note">এখনো কোনো ডেস্কে প্রকাশিত লেখা নেই।</p>
            )}
          </ProfileSideBlock>

          {facts.length > 0 ? (
            <ProfileSideBlock icon={GraduationCap} label="পরিচয়ের তথ্য">
              <dl className="pf-facts">
                {facts.map((fact) => (
                  <div className="pf-fact" key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </ProfileSideBlock>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
