"use client";

import Link from "next/link";
import * as React from "react";
import {
  Bookmark,
  IdCard,
  PenLine,
  Percent,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import { ContentEditDialog, type EditTarget } from "@/components/account/content-edit-dialog";
import { SignInButton } from "@/components/auth/sign-in-button";
import { ProfileEditDialog } from "@/components/profile/profile-edit-dialog";
import { PublicProfileSettings } from "@/components/profile/public-profile-settings";
import {
  EntryDot,
  ProfileBand,
  ProfileEntry,
  ProfileKicker,
  ProfileMeta,
  ProfileSectionHead,
  ProfileSideBlock,
  ProfileStats,
  ProfileTip,
} from "@/components/profile/profile-pieces";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, reportError } from "@/lib/errors";
import { previewMember } from "@/lib/preview";
import { bn, bnMoney, formatDateBn } from "@/lib/site";
import {
  isMissingSession,
  isSupabaseConfigured,
  supabaseBrowser,
} from "@/lib/supabase";

/*
 * The member's own corner, `/account/`.
 *
 * It is the same page as `/u/<handle>/` — the reference design's editorial
 * profile, one band, one identity, one strip of real numbers, reporting in a wide
 * column and tools in a narrow one — because a member's own view of themselves
 * should not look like a control panel bolted to a different site.
 *
 * What is *not* restyled is the behaviour: the same four reads on load, the same
 * three tabs, the same correction requests (an edit here is a request the desk
 * reviews, never a write), the same Spotlight statuses and the same dialogs. The
 * pieces below take their data from that logic untouched.
 *
 * Two changes the layout forced, both deliberate:
 *
 *  - every number in the strip has to be read before it can be printed, so the
 *    dashboard now takes its three reads when the session arrives rather than
 *    when a tab is opened — one read for the whole page, the way the front page
 *    works, instead of one per tab;
 *  - with no Supabase credentials at all (demo builds and pull-request previews)
 *    the preview member stands in — the same member `/u/<handle>/` shows — so the
 *    page can be reviewed as a profile instead of as an empty shell.
 */

type Role = "reader" | "reporter" | "moderator" | "admin";

type MyArticle = {
  id: string;
  slug: string;
  title: string;
  status: string;
  created_at: string;
  published_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
};

type MySpotlight = {
  id: string;
  title: string;
  issue_status: string;
  created_at: string;
  solver_kind: string | null;
  solver_name: string | null;
  solve_duration: string | null;
  issue_note: string | null;
};

const ARTICLE_STATUS_LABELS: Record<string, string> = {
  draft: "খসড়া",
  pending: "অপেক্ষমাণ",
  published: "প্রকাশিত",
  rejected: "প্রত্যাখ্যাত",
};

const ISSUE_STATUS_LABELS: Record<string, string> = {
  open: "খোলা",
  in_progress: "কাজ চলছে",
  solved: "সমাধান হয়েছে",
  invalid: "ভিত্তিহীন / অপ্রাসঙ্গিক",
};

const ROLE_LABELS: Record<Role, string> = {
  reader: "পাঠক",
  reporter: "রিপোর্টার",
  moderator: "মডারেটর",
  admin: "প্রশাসক",
};

const SPOTLIGHT_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "সব" },
  { key: "open", label: "খোলা" },
  { key: "in_progress", label: "কাজ চলছে" },
  { key: "solved", label: "সমাধান হয়েছে" },
  { key: "invalid", label: "ভিত্তিহীন" },
];

/** The state a row is in, as the stylesheet's own tint for it. */
function statusClass(status: string): string {
  return `pf-status ${status === "draft" ? "open" : status}`;
}

export function AccountDashboard() {
  const demo = !isSupabaseConfigured();
  const [loading, setLoading] = React.useState(true);
  const [signedIn, setSignedIn] = React.useState(false);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("আপনার নাম");
  const [handle, setHandle] = React.useState("@username");
  const [avatar, setAvatar] = React.useState<string | null>(null);
  const [cover, setCover] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<Role>("reader");
  const [completion, setCompletion] = React.useState(0);
  const [balance, setBalance] = React.useState("৳০");
  const [loadError, setLoadError] = React.useState("");
  const [editOpen, setEditOpen] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"identity" | "news" | "spotlights">(
    "identity",
  );

  const [articles, setArticles] = React.useState<MyArticle[] | null>(null);
  const [articlesError, setArticlesError] = React.useState("");
  const [spotlights, setSpotlights] = React.useState<MySpotlight[] | null>(null);
  const [spotlightError, setSpotlightError] = React.useState("");
  const [spotlightFilter, setSpotlightFilter] = React.useState("all");
  // An edit here is a request, never a write, so this holds the row being corrected and which
  // kind it is — one dialog serves a story and a Spotlight post.
  const [editing, setEditing] = React.useState<{
    kind: "article" | "spotlight";
    target: EditTarget;
  } | null>(null);
  // The row whose full text is being fetched, so only that row's button reads as busy.
  const [editBusyId, setEditBusyId] = React.useState<string | null>(null);
  const [pendingArticleEdits, setPendingArticleEdits] = React.useState<
    Set<string>
  >(() => new Set());
  const [pendingSpotlightEdits, setPendingSpotlightEdits] = React.useState<
    Set<string>
  >(() => new Set());

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      /*
        Demo builds and pull-request previews run without Supabase credentials,
        and supabaseBrowser() throws in that case instead of handing back a dead
        client. This effect finishes in a `finally` with no `catch`, so without
        this guard the throw escapes the effect, reaches the error boundary and
        replaces the page with Next's error document.

        The preview member stands in for that build: the same person the public
        profile shows, so the two halves of one identity agree, and they are the
        only member a preview ever answers as.
      */
      if (demo) {
        setName(previewMember.displayName);
        setHandle(`@${previewMember.username}`);
        setRole(previewMember.role);
        setCompletion(previewMember.completion);
        setBalance(bnMoney(previewMember.balance));
        setArticles(previewMember.articles);
        setSpotlights(previewMember.spotlights);
        setSignedIn(true);
        setUserId(previewMember.username);
        setLoading(false);
        return;
      }
      try {
        const supabase = supabaseBrowser();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError && !isMissingSession(authError)) {
          // The session could not be checked — which is not the same as being signed out, so the
          // dashboard reports the failure instead of inviting a fresh sign-in.
          reportError("account session", authError);
          if (!cancelled) setLoadError("সেশন যাচাই করা যায়নি। আবার চেষ্টা করুন।");
          return;
        }
        if (cancelled) return;
        if (!user) {
          setSignedIn(false);
          setLoading(false);
          return;
        }
        setSignedIn(true);
        setUserId(user.id);
        const [profileResult, roleResult, completionResult, walletResult] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("username,display_name,avatar_url,cover_url")
              .eq("id", user.id)
              .maybeSingle(),
            supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", user.id)
              .maybeSingle(),
            supabase.rpc("get_my_profile_completion"),
            supabase.rpc("get_my_wallet"),
          ]);
        if (cancelled) return;
        const queryErrors = [
          ["account profile", profileResult.error],
          ["account role", roleResult.error],
          ["account completion", completionResult.error],
          ["account wallet", walletResult.error],
        ] as const;
        for (const [context, error] of queryErrors) {
          if (error) reportError(context, error);
        }
        if (queryErrors.some(([, error]) => error)) {
          setLoadError("ড্যাশবোর্ডের কিছু তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।");
        }
        const profile = profileResult.data as {
          username?: string;
          display_name?: string;
          avatar_url?: string | null;
          cover_url?: string | null;
        } | null;
        setName(
          profile?.display_name ||
            String(
              user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                "আপনার নাম",
            ),
        );
        setHandle(`@${profile?.username ?? ""}`);
        setAvatar(profile?.avatar_url ?? null);
        setCover(profile?.cover_url ?? null);
        setRole((roleResult.data?.role as Role | undefined) ?? "reader");
        setCompletion(Number(completionResult.data ?? 0));
        const wallet = walletResult.data as {
          available?: number;
          held?: number;
          reserved?: number;
        } | null;
        setBalance(
          bnMoney(
            Number(wallet?.available ?? 0) +
              Number(wallet?.held ?? 0) +
              Number(wallet?.reserved ?? 0),
          ),
        );
      } catch (err) {
        reportError("account dashboard", err);
        if (!cancelled) {
          setLoadError("ড্যাশবোর্ডের তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।");
          setSignedIn(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo]);

  const loadArticles = React.useCallback(async () => {
    setArticlesError("");
    try {
      const { data, error } = await supabaseBrowser().rpc("get_my_articles");
      if (error) {
        setArticlesError(
          errorMessage("my articles", error, "আপনার সংবাদ লোড করা যায়নি।"),
        );
        return;
      }
      setArticles((data as unknown as MyArticle[] | null) ?? []);
    } catch (err) {
      setArticlesError(
        errorMessage("my articles", err, "আপনার সংবাদ লোড করা যায়নি।"),
      );
    }
  }, []);

  const loadSpotlights = React.useCallback(
    async (authorId: string) => {
      setSpotlightError("");
      try {
        const { data, error } = await supabaseBrowser()
          .from("spotlight_posts")
          .select(
            "id,title,issue_status,created_at,solver_kind,solver_name,solve_duration,issue_note",
          )
          .eq("author_id", authorId)
          .order("created_at", { ascending: false });
        if (error) {
          setSpotlightError(
            errorMessage("my spotlights", error, "আপনার স্পটলাইট পোস্ট লোড করা যায়নি।"),
          );
          return;
        }
        setSpotlights((data as unknown as MySpotlight[] | null) ?? []);
      } catch (err) {
        setSpotlightError(
          errorMessage("my spotlights", err, "আপনার স্পটলাইট পোস্ট লোড করা যায়নি।"),
        );
      }
    },
    [],
  );

  // The author's own pending edit requests, so a row can say a correction is already waiting
  // instead of offering a second one the database would refuse.
  const loadPendingEdits = React.useCallback(async (authorId: string) => {
    try {
      const supabase = supabaseBrowser();
      const [articleResult, spotlightResult] = await Promise.all([
        supabase
          .from("article_edit_requests")
          .select("article_id")
          .eq("editor_id", authorId)
          .eq("status", "pending"),
        supabase
          .from("spotlight_edit_requests")
          .select("post_id")
          .eq("editor_id", authorId)
          .eq("status", "pending"),
      ]);
      if (articleResult.error) reportError("pending article edits", articleResult.error);
      if (spotlightResult.error)
        reportError("pending spotlight edits", spotlightResult.error);
      setPendingArticleEdits(
        new Set(
          ((articleResult.data ?? []) as { article_id: string }[]).map(
            (row) => row.article_id,
          ),
        ),
      );
      setPendingSpotlightEdits(
        new Set(
          ((spotlightResult.data ?? []) as { post_id: string }[]).map(
            (row) => row.post_id,
          ),
        ),
      );
    } catch (err) {
      reportError("pending edits", err);
    }
  }, []);

  /*
    One read for the whole page, not one per tab: the strip above prints the
    counts, so the counts have to be in hand before a tab is opened. The preview
    build has nothing to ask, and asks nothing.
  */
  React.useEffect(() => {
    if (demo || !signedIn || !userId) return;
    void loadPendingEdits(userId);
    void loadArticles();
    void loadSpotlights(userId);
  }, [demo, signedIn, userId, loadArticles, loadSpotlights, loadPendingEdits]);

  /*
    Both lists carry only titles and dates, so opening the editor fetches that one row whole.
    Seeding the editor from a list entry would quietly publish a story that had lost its text the
    moment a reviewer approved the correction.
  */
  async function openArticleEditor(article: MyArticle) {
    setEditBusyId(article.id);
    setArticlesError("");
    try {
      const { data, error } = await supabaseBrowser()
        .from("articles")
        .select("id,title,excerpt,body")
        .eq("id", article.id)
        .maybeSingle();
      if (error) {
        setArticlesError(
          errorMessage("article for edit", error, "প্রতিবেদনটি লোড করা যায়নি।"),
        );
        return;
      }
      const row = data as {
        id: string;
        title: string;
        excerpt: string | null;
        body: string;
      } | null;
      if (!row) {
        setArticlesError("প্রতিবেদনটি লোড করা যায়নি।");
        return;
      }
      setEditing({
        kind: "article",
        target: {
          id: row.id,
          title: row.title,
          excerpt: row.excerpt,
          body: row.body,
        },
      });
    } catch (err) {
      setArticlesError(
        errorMessage("article for edit", err, "প্রতিবেদনটি লোড করা যায়নি।"),
      );
    } finally {
      setEditBusyId(null);
    }
  }

  async function openSpotlightEditor(post: MySpotlight) {
    setEditBusyId(post.id);
    setSpotlightError("");
    try {
      const { data, error } = await supabaseBrowser()
        .from("spotlight_posts")
        .select("id,title,description")
        .eq("id", post.id)
        .maybeSingle();
      if (error) {
        setSpotlightError(
          errorMessage("spotlight for edit", error, "পোস্টটি লোড করা যায়নি।"),
        );
        return;
      }
      const row = data as {
        id: string;
        title: string;
        description: string;
      } | null;
      if (!row) {
        setSpotlightError("পোস্টটি লোড করা যায়নি।");
        return;
      }
      setEditing({
        kind: "spotlight",
        target: { id: row.id, title: row.title, body: row.description },
      });
    } catch (err) {
      setSpotlightError(
        errorMessage("spotlight for edit", err, "পোস্টটি লোড করা যায়নি।"),
      );
    } finally {
      setEditBusyId(null);
    }
  }

  /** A filed request changes the row's badge, so the pending set and the lists are re-read. */
  function refreshAfterEdit() {
    if (demo) return;
    if (userId) void loadPendingEdits(userId);
    void loadArticles();
    if (userId) void loadSpotlights(userId);
  }

  if (loading) {
    return (
      <div className="pf-page">
        <ProfileBand tag="সদস্য পরিসর" />
        <header className="pf-head">
          <Skeleton className="size-[152px] rounded-full" />
          <div className="pf-body">
            <Skeleton className="mb-3 h-4 w-32" />
            <Skeleton className="mb-4 h-12 w-64" />
            <Skeleton className="mb-3 h-4 w-48" />
            <Skeleton className="h-16 w-full" />
          </div>
        </header>
        <div className="pf-stats">
          {[0, 1, 2, 3].map((slot) => (
            <div className="pf-stat" key={slot}>
              <Skeleton className="h-9 w-20" />
              <Skeleton className="mt-3 h-3 w-28" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="pf-page">
        <ProfileBand tag="সদস্য পরিসর" />
        <div className="pf-layout">
          <section className="pf-main">
            <ProfileSectionHead title="অ্যাকাউন্টে প্রবেশ করুন" sub="গুগল" />
            {loadError && (
              <p className="pf-alert" role="alert">
                {loadError}
              </p>
            )}
            <p className="pf-note">
              প্রোফাইল, সংরক্ষিত খবর ও লেখালেখির সবকিছু এক জায়গায় দেখতে আগে গুগল
              দিয়ে প্রবেশ করুন।
            </p>
            <div className="pf-actions">
              <SignInButton />
            </div>
          </section>
          <aside>
            <ProfileTip
              kicker="খোলা পড়া"
              title="প্রবেশ ছাড়াও পড়া যায়"
              body="মূলপাতার সব প্রতিবেদন, বিভাগ ও স্পটলাইট খোলা — প্রবেশ করা লাগে কেবল নিজের পরিসর দেখতে।"
              action={
                <Link className="pf-btn" href="/">
                  মূলপাতায় যান
                </Link>
              }
            />
          </aside>
        </div>
      </div>
    );
  }

  const roleLabel = ROLE_LABELS[role] ?? ROLE_LABELS.reader;
  const publicHandle = handle.replace(/^@/, "");
  const publicProfilePath = publicHandle
    ? `/u/${encodeURIComponent(publicHandle)}/`
    : null;

  const actions = [
    {
      href: "/saved/",
      icon: Bookmark,
      title: "সংরক্ষিত প্রতিবেদন",
      subtitle: "পরে পড়ার জন্য রাখা খবর দেখুন",
      show: true,
    },
    {
      href: "/account/write/",
      icon: PenLine,
      title: role === "reader" ? "রিপোর্টার হিসেবে আবেদন" : "প্রতিবেদন লিখুন",
      subtitle: "নিজের লেখা ও প্রস্তাবনা পাঠান",
      show: true,
    },
    {
      href: "/account/balance/",
      icon: Wallet,
      title: "আয় ও উত্তোলন",
      subtitle: "জমা আয় ও উত্তোলনের ইতিহাস",
      show: true,
    },
    {
      href: "/account/moderation/",
      icon: ShieldCheck,
      title: "মডারেশন ডেস্ক",
      subtitle: "অপেক্ষমাণ প্রতিবেদন পর্যালোচনা করুন",
      show: role === "moderator" || role === "admin",
    },
    {
      href: "/account/admin/",
      icon: Settings2,
      title: "প্রশাসনিক নিয়ন্ত্রণ",
      subtitle: "ব্যবহারকারী ও অর্থপরিশোধ পরিচালনা করুন",
      show: role === "admin",
    },
  ];

  const tabs: { key: "identity" | "news" | "spotlights"; label: string }[] = [
    { key: "identity", label: "পরিচয়" },
    { key: "news", label: "আমার সংবাদ" },
    { key: "spotlights", label: "আমার স্পটলাইট" },
  ];

  const articleCounts = {
    published: (articles ?? []).filter((a) => a.status === "published").length,
    pending: (articles ?? []).filter((a) => a.status === "pending").length,
    rejected: (articles ?? []).filter((a) => a.status === "rejected").length,
  };

  const filteredSpotlights = (spotlights ?? []).filter((post) =>
    spotlightFilter === "all" ? true : post.issue_status === spotlightFilter,
  );

  const panelSub = {
    identity: roleLabel,
    news: `প্রকাশিত ${bn(articleCounts.published)} · অপেক্ষমাণ ${bn(
      articleCounts.pending,
    )} · প্রত্যাখ্যাত ${bn(articleCounts.rejected)}`,
    spotlights: `মোট ${bn((spotlights ?? []).length)}`,
  }[tab];

  const identityFacts: [string, string][] = [
    ["নাম", name],
    ["ইউজারনেম", handle],
    ["ভূমিকা", roleLabel],
    ["প্রোফাইল সম্পূর্ণ", `${bn(completion)}%`],
    ["প্রকাশ্য প্রোফাইল", publicHandle ? "চালু" : "সেট করা হয়নি"],
  ];

  return (
    <div className="pf-page">
      {loadError && (
        <p className="pf-alert" role="alert">
          {loadError}
        </p>
      )}

      <ProfileBand
        tag={demo ? "প্রিভিউ সদস্য" : "সদস্য পরিসর"}
        cover={cover}
      />
      <header className="pf-head">
        <span className="pf-avatar">
          {avatar ? (
            <img src={avatar} alt="" />
          ) : (
            <span aria-hidden>{name.slice(0, 1)}</span>
          )}
        </span>
        <div className="pf-body">
          <ProfileKicker>{roleLabel}</ProfileKicker>
          <h1 className="pf-name">{name}</h1>
          <p className="pf-role">
            {handle}
            {" · "}
            <b>{publicHandle ? "প্রকাশ্য প্রোফাইল চালু" : "প্রকাশ্য প্রোফাইল নেই"}</b>
          </p>
          <ProfileMeta
            items={[
              { icon: ShieldCheck, text: roleLabel },
              { icon: Percent, text: `সম্পূর্ণ ${bn(completion)}%` },
              { icon: Wallet, text: balance },
              { icon: IdCard, text: handle },
            ]}
          />
          <div className="pf-actions">
            <button
              type="button"
              className="pf-btn primary"
              onClick={() => setEditOpen(true)}
            >
              <PenLine aria-hidden />
              প্রোফাইল সম্পাদনা
            </button>
            <button
              type="button"
              className="pf-btn ghost"
              onClick={() => setManageOpen(true)}
            >
              <Settings2 aria-hidden />
              পাবলিক প্রোফাইল ব্যবস্থাপনা
            </button>
            {publicProfilePath ? (
              <Link className="pf-btn ghost" href={publicProfilePath}>
                <IdCard aria-hidden />
                প্রকাশ্য পাতাটি দেখুন
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <ProfileStats
        stats={[
          { value: bn(articleCounts.published), label: "প্রকাশিত সংবাদ" },
          { value: bn(articleCounts.pending), label: "অপেক্ষমাণ" },
          { value: bn((spotlights ?? []).length), label: "স্পটলাইট পোস্ট" },
          { value: balance, label: "জমা আয়" },
        ]}
      />

      <div className="pf-layout">
        <section className="pf-main" aria-labelledby="account-panel-heading">
          <ProfileSectionHead
            id="account-panel-heading"
            title={tabs.find((entry) => entry.key === tab)?.label ?? ""}
            sub={panelSub}
          />

          <div
            role="tablist"
            aria-label="ড্যাশবোর্ড বিভাগ"
            className="pf-chips"
          >
            {tabs.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                id={`account-tab-${entry.key}`}
                aria-selected={tab === entry.key}
                aria-controls="account-panel"
                className={`pf-chip${tab === entry.key ? " active" : ""}`}
                onClick={() => setTab(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div
            id="account-panel"
            role="tabpanel"
            aria-labelledby={`account-tab-${tab}`}
          >
            {tab === "identity" && (
              <>
                <dl className="pf-facts">
                  {identityFacts.map(([label, value]) => (
                    <div className="pf-fact" key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <ProfileSideBlock icon={Percent} label="প্রোফাইল সম্পূর্ণ">
                  <Progress value={completion} />
                  <p className="pf-link-sub mt-3">
                    {completion === 100
                      ? "প্রোফাইল সম্পূর্ণ—যোগ্য হলে আয়ের সুবিধা চালু আছে।"
                      : "তথ্য পূরণ করলে আপনার লেখার আয়ের সুবিধা চালু হবে।"}
                  </p>
                </ProfileSideBlock>
              </>
            )}

            {tab === "news" && (
              <>
                {articlesError && (
                  <p className="pf-alert" role="alert">
                    {articlesError}
                  </p>
                )}
                {!articlesError && articles === null && (
                  <p className="pf-note">লোড হচ্ছে…</p>
                )}
                {!articlesError && articles !== null && articles.length === 0 && (
                  <p className="pf-note">
                    এখনো কোনো সংবাদ জমা দেওয়া হয়নি।{" "}
                    <Link href="/account/write/">প্রথম প্রতিবেদন লিখুন</Link>।
                  </p>
                )}
                {articles !== null && articles.length > 0 && (
                  <div className="pf-list">
                    {articles.map((article) => {
                      const when =
                        article.status === "published" && article.published_at
                          ? article.published_at
                          : article.status === "rejected" && article.rejected_at
                            ? article.rejected_at
                            : article.created_at;
                      const label =
                        ARTICLE_STATUS_LABELS[article.status] ?? article.status;
                      return (
                        <ProfileEntry
                          key={article.id}
                          wide
                          href={
                            article.status === "published"
                              ? `/news/${encodeURIComponent(article.slug)}/`
                              : null
                          }
                          title={article.title}
                          excerpt={
                            article.status === "rejected" &&
                            article.rejection_reason
                              ? `কারণ: ${article.rejection_reason}`
                              : null
                          }
                          meta={
                            <>
                              <time dateTime={when}>{formatDateBn(when)}</time>
                              <EntryDot />
                              <span className={statusClass(article.status)}>
                                {label}
                              </span>
                            </>
                          }
                          actions={
                            pendingArticleEdits.has(article.id) ? (
                              <span className={statusClass("pending")}>
                                সম্পাদনা অনুমোদনের অপেক্ষায়
                              </span>
                            ) : article.status === "published" ? (
                              <button
                                type="button"
                                className="pf-btn ghost sm"
                                disabled={editBusyId === article.id}
                                onClick={() => void openArticleEditor(article)}
                              >
                                সংশোধনের অনুরোধ
                              </button>
                            ) : null
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {tab === "spotlights" && (
              <>
                <div className="pf-chips" role="group" aria-label="ইস্যুর অবস্থা">
                  {SPOTLIGHT_FILTERS.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      aria-pressed={spotlightFilter === filter.key}
                      className={`pf-chip${
                        spotlightFilter === filter.key ? " active" : ""
                      }`}
                      onClick={() => setSpotlightFilter(filter.key)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                {spotlightError && (
                  <p className="pf-alert" role="alert">
                    {spotlightError}
                  </p>
                )}
                {!spotlightError && spotlights === null && (
                  <p className="pf-note">লোড হচ্ছে…</p>
                )}
                {!spotlightError &&
                  spotlights !== null &&
                  filteredSpotlights.length === 0 && (
                    <p className="pf-note">
                      এই ছাঁকনিতে কোনো ইস্যু নেই।{" "}
                      <Link href="/spotlight/">স্পটলাইটে যান</Link>।
                    </p>
                  )}
                {filteredSpotlights.length > 0 && (
                  <div className="pf-list">
                    {filteredSpotlights.map((post) => (
                      <ProfileEntry
                        key={post.id}
                        wide
                        href={`/spotlight/${encodeURIComponent(post.id)}/`}
                        title={post.title}
                        excerpt={post.issue_note}
                        meta={
                          <>
                            <time dateTime={post.created_at}>
                              {formatDateBn(post.created_at)}
                            </time>
                            {post.solver_name || post.solve_duration ? (
                              <>
                                <EntryDot />
                                <span>
                                  {[post.solver_name, post.solve_duration]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              </>
                            ) : null}
                            <EntryDot />
                            <span className={statusClass(post.issue_status)}>
                              {ISSUE_STATUS_LABELS[post.issue_status] ??
                                post.issue_status}
                            </span>
                          </>
                        }
                        actions={
                          pendingSpotlightEdits.has(post.id) ? (
                            <span className={statusClass("pending")}>
                              সম্পাদনা অনুমোদনের অপেক্ষায়
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="pf-btn ghost sm"
                              disabled={editBusyId === post.id}
                              onClick={() => void openSpotlightEditor(post)}
                            >
                              সংশোধনের অনুরোধ
                            </button>
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <aside>
          <ProfileSideBlock icon={Wallet} label="আয়">
            <dl className="pf-facts">
              <div className="pf-fact">
                <dt>জমা আয়</dt>
                <dd>{balance}</dd>
              </div>
              <div className="pf-fact">
                <dt>অবস্থা</dt>
                <dd>
                  {completion === 100 ? "উত্তোলনের জন্য প্রস্তুত" : "আটকে আছে"}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex">
              <Link className="pf-btn ghost sm" href="/account/balance/">
                আয়ের বিস্তারিত
              </Link>
            </div>
          </ProfileSideBlock>

          <ProfileSideBlock icon={Sparkles} label="আমার সরঞ্জাম">
            <ul className="pf-links">
              {actions
                .filter((action) => action.show)
                .map((action) => (
                  <li key={action.href}>
                    <Link className="pf-link" href={action.href}>
                      <action.icon aria-hidden />
                      <span className="pf-link-text">
                        <span className="pf-link-title">{action.title}</span>
                        <span className="pf-link-sub">{action.subtitle}</span>
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </ProfileSideBlock>

          <ProfileTip
            kicker="সম্পাদকীয় ডেস্ক"
            title="নতুন প্রতিবেদন পাঠান"
            body="খসড়া জমা দিলে সম্পাদকীয় ডেস্ক যাচাই করে প্রকাশ করবে; প্রকাশিত লেখার আয় জমা হবে আপনার অ্যাকাউন্টে।"
            action={
              <Link className="pf-btn" href="/account/write/">
                <PenLine aria-hidden />
                প্রতিবেদন লিখুন
              </Link>
            }
          />
        </aside>
      </div>

      <ContentEditDialog
        kind={editing?.kind ?? "article"}
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        target={editing?.target ?? null}
        onSubmitted={refreshAfterEdit}
      />
      <ProfileEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={setCompletion}
        onImagesChanged={(images) => {
          setAvatar(images.avatar_url);
          setCover(images.cover_url);
        }}
      />
      <PublicProfileSettings open={manageOpen} onOpenChange={setManageOpen} />
    </div>
  );
}
