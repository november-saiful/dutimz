"use client";

import Link from "next/link";
import * as React from "react";
import { Bookmark, PenLine, Settings2, ShieldCheck, Wallet } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ContentEditDialog, type EditTarget } from "@/components/account/content-edit-dialog";
import { SignInButton } from "@/components/auth/sign-in-button";
import { ProfileEditDialog } from "@/components/profile/profile-edit-dialog";
import { PublicProfileSettings } from "@/components/profile/public-profile-settings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage, reportError } from "@/lib/errors";
import {
  isMissingSession,
  isSupabaseConfigured,
  supabaseBrowser,
} from "@/lib/supabase";
import { bn, bnMoney, formatDateBn } from "@/lib/site";

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

const SPOTLIGHT_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "সব" },
  { key: "open", label: "খোলা" },
  { key: "in_progress", label: "কাজ চলছে" },
  { key: "solved", label: "সমাধান হয়েছে" },
  { key: "invalid", label: "ভিত্তিহীন" },
];

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "rejected" || status === "invalid") return "destructive";
  if (status === "published" || status === "solved") return "outline";
  return "secondary";
}

export function AccountDashboard() {
  const [loading, setLoading] = React.useState(true);
  const [signedIn, setSignedIn] = React.useState(false);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("আপনার নাম");
  const [handle, setHandle] = React.useState("@username");
  const [avatar, setAvatar] = React.useState<string | null>(null);
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
      */
      if (!isSupabaseConfigured()) {
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
              .select("username,display_name,avatar_url")
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
  }, []);

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

  React.useEffect(() => {
    if (!signedIn || !userId) return;
    void loadPendingEdits(userId);
    if (tab === "news") void loadArticles();
    if (tab === "spotlights") void loadSpotlights(userId);
  }, [tab, signedIn, userId, loadArticles, loadSpotlights, loadPendingEdits]);

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
    if (userId) void loadPendingEdits(userId);
    if (tab === "news") void loadArticles();
    if (tab === "spotlights" && userId) void loadSpotlights(userId);
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          {loadError && <CardTitle className="text-destructive">{loadError}</CardTitle>}
          <CardTitle>অ্যাকাউন্টে প্রবেশ করুন</CardTitle>
          <CardDescription>
            ড্যাশবোর্ড দেখতে আগে গুগল দিয়ে প্রবেশ করুন।
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInButton />
        </CardContent>
      </Card>
    );
  }

  const actions = [
    {
      href: "/saved",
      icon: Bookmark,
      title: "সংরক্ষিত প্রতিবেদন",
      subtitle: "পরে পড়ার জন্য রাখা খবর দেখুন",
      show: true,
    },
    {
      href: "/account/write",
      icon: PenLine,
      title: role === "reader" ? "রিপোর্টার হিসেবে আবেদন" : "প্রতিবেদন লিখুন",
      subtitle: "নিজের লেখা ও প্রস্তাবনা পাঠান",
      show: true,
    },
    {
      href: "/account/balance",
      icon: Wallet,
      title: "আয় ও উত্তোলন",
      subtitle: "জমা আয় ও উত্তোলনের ইতিহাস",
      show: true,
    },
    {
      href: "/account/moderation",
      icon: ShieldCheck,
      title: "মডারেশন ডেস্ক",
      subtitle: "অপেক্ষমাণ প্রতিবেদন পর্যালোচনা করুন",
      show: role === "moderator" || role === "admin",
    },
    {
      href: "/account/admin",
      icon: Settings2,
      title: "প্রশাসনিক নিয়ন্ত্রণ",
      subtitle: "ব্যবহারকারী ও অর্থপরিশোধ পরিচালনা করুন",
      show: role === "admin",
    },
  ];

  const publicHandle = handle.replace(/^@/, "");

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

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}

      <div
        role="tablist"
        aria-label="ড্যাশবোর্ড বিভাগ"
        className="flex flex-wrap gap-1 rounded-lg border p-1"
      >
        {tabs.map((entry) => (
          <Button
            key={entry.key}
            role="tab"
            aria-selected={tab === entry.key}
            variant={tab === entry.key ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab(entry.key)}
          >
            {entry.label}
          </Button>
        ))}
      </div>

      {tab === "identity" && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <p className="text-xs font-medium text-muted-foreground">
                  আপনার পরিচয়
                </p>
                <div className="flex items-center gap-3">
                  <Avatar className="size-12">
                    {avatar && <AvatarImage src={avatar} alt="" />}
                    <AvatarFallback>ঢা</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-lg">{name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{handle}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  প্রোফাইল সম্পাদনা
                </Button>
                {publicHandle ? (
                  <Button variant="outline" asChild>
                    <Link href={`/u/${encodeURIComponent(publicHandle)}/`}>
                      পাবলিক প্রোফাইল দেখুন
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    পাবলিক প্রোফাইল দেখুন
                  </Button>
                )}
                <Button variant="outline" onClick={() => setManageOpen(true)}>
                  পাবলিক প্রোফাইল ব্যবস্থাপনা
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <p className="text-xs font-medium text-muted-foreground">
                  মোট জমা আয়
                </p>
                <CardTitle className="text-2xl tabular-nums">{balance}</CardTitle>
                <CardDescription>
                  প্রোফাইল সম্পূর্ণ না হওয়া পর্যন্ত জমা আয় আটকে থাকবে।
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="link" className="px-0" asChild>
                  <Link href="/account/balance">বিস্তারিত দেখুন →</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <p className="text-xs font-medium text-muted-foreground">
                  প্রোফাইল সম্পূর্ণ
                </p>
                <CardTitle className="text-2xl tabular-nums">
                  {bn(completion)}%
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Progress value={completion} />
                <p className="text-xs text-muted-foreground">
                  {completion === 100
                    ? "প্রোফাইল সম্পূর্ণ—যোগ্য হলে আয়ের সুবিধা চালু আছে।"
                    : "তথ্য পূরণ করলে আপনার লেখার আয়ের সুবিধা চালু হবে।"}
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {actions
              .filter((a) => a.show)
              .map((action) => (
                <Link key={action.href} href={action.href}>
                  <Card className="transition-colors hover:bg-accent">
                    <CardContent className="flex items-center gap-3 pt-6">
                      <action.icon className="size-6 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{action.title}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {action.subtitle}
                        </p>
                      </div>
                      <span aria-hidden>→</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        </div>
      )}

      {tab === "news" && (
        <Card>
          <CardHeader>
            <CardTitle>আমার সংবাদ</CardTitle>
            <CardDescription>
              প্রকাশিত {bn(articleCounts.published)} · অপেক্ষমাণ{" "}
              {bn(articleCounts.pending)} · প্রত্যাখ্যাত {bn(articleCounts.rejected)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {articlesError && <p className="text-sm text-destructive" role="alert">{articlesError}</p>}
            {!articlesError && articles === null && (
              <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>
            )}
            {!articlesError && articles !== null && articles.length === 0 && (
              <p className="text-sm text-muted-foreground">
                এখনো কোনো সংবাদ জমা দেওয়া হয়নি।{" "}
                <Link href="/account/write" className="underline">
                  প্রথম প্রতিবেদন লিখুন
                </Link>
                ।
              </p>
            )}
            {articles !== null && articles.length > 0 && (
              <div className="overflow-x-auto">
                <Table aria-label="আমার সংবাদ">
                  <TableHeader>
                    <TableRow>
                      <TableHead>শিরোনাম</TableHead>
                      <TableHead>অবস্থা</TableHead>
                      <TableHead>তারিখ</TableHead>
                      <TableHead className="w-48">
                        <span className="sr-only">পদক্ষেপ</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {articles.map((article) => (
                      <TableRow key={article.id}>
                        <TableCell className="max-w-[28rem]">
                          <p className="truncate font-medium">{article.title}</p>
                          {article.status === "rejected" && article.rejection_reason && (
                            <p className="mt-1 text-xs text-destructive">
                              কারণ: {article.rejection_reason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(article.status)}>
                            {ARTICLE_STATUS_LABELS[article.status] ?? article.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {article.status === "published" && article.published_at
                            ? formatDateBn(article.published_at)
                            : article.status === "rejected" && article.rejected_at
                              ? formatDateBn(article.rejected_at)
                              : formatDateBn(article.created_at)}
                        </TableCell>
                        <TableCell className="align-top">
                          {pendingArticleEdits.has(article.id) ? (
                            <Badge variant="secondary">
                              সম্পাদনা অনুমোদনের অপেক্ষায়
                            </Badge>
                          ) : article.status === "published" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={editBusyId === article.id}
                              onClick={() => void openArticleEditor(article)}
                            >
                              সংশোধনের অনুরোধ
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "spotlights" && (
        <Card>
          <CardHeader>
            <CardTitle>আমার স্পটলাইট</CardTitle>
            <CardDescription>
              জমা দেওয়া ইস্যু ও তাদের বর্তমান অবস্থা।
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-1">
              {SPOTLIGHT_FILTERS.map((filter) => (
                <Button
                  key={filter.key}
                  variant={spotlightFilter === filter.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSpotlightFilter(filter.key)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
            {spotlightError && <p className="text-sm text-destructive" role="alert">{spotlightError}</p>}
            {!spotlightError && spotlights === null && (
              <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>
            )}
            {!spotlightError && spotlights !== null && filteredSpotlights.length === 0 && (
              <p className="text-sm text-muted-foreground">
                এই ছাঁকনিতে কোনো ইস্যু নেই।{" "}
                <Link href="/spotlight" className="underline">
                  স্পটলাইটে যান
                </Link>
                ।
              </p>
            )}
            {filteredSpotlights.map((post) => (
              <div key={post.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{post.title}</p>
                  <Badge variant={statusVariant(post.issue_status)}>
                    {ISSUE_STATUS_LABELS[post.issue_status] ?? post.issue_status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateBn(post.created_at)}
                  {post.solver_name ? ` · ${post.solver_name}` : ""}
                </p>
                {post.issue_note && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {post.issue_note}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {pendingSpotlightEdits.has(post.id) ? (
                    <Badge variant="secondary">
                      সম্পাদনা অনুমোদনের অপেক্ষায়
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={editBusyId === post.id}
                      onClick={() => void openSpotlightEditor(post)}
                    >
                      সংশোধনের অনুরোধ
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ContentEditDialog
        kind={editing?.kind ?? "article"}
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        target={editing?.target ?? null}
        onSubmitted={refreshAfterEdit}
      />
      <ProfileEditDialog open={editOpen} onOpenChange={setEditOpen} onSaved={setCompletion} />
      <PublicProfileSettings open={manageOpen} onOpenChange={setManageOpen} />
    </div>
  );
}
