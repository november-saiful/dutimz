"use client";

import * as React from "react";

import { AuthedMediaImage } from "@/components/article/authed-media-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { Textarea } from "@/components/ui/textarea";
import { revalidateReaders } from "@/lib/desk-client";
import { errorMessage } from "@/lib/errors";
import { bn, formatDateBn } from "@/lib/site";
import { one, supabaseBrowser } from "@/lib/supabase";

/*
  The desk's second queue: edits to writing that is already live.

  A published story or Spotlight post can be corrected by its author, but nothing they propose
  reaches a reader until someone here approves it — which is the whole point of the queue. The
  reviewer therefore has to see the proposal next to what is live right now, and it has to be the
  same rendering the reader gets, or a formatting mistake would slip through a review that looked
  fine. Both sides are drawn with `RichTextContent` for that reason, and both are put in a scroll
  box because a story body is longer than a review card.

  The reason is mandatory for a rejection as much as for an approval: it is what the author is told,
  and it is what the accountability log keeps.
*/

type Editor = { username: string; display_name: string };

type ArticleEditRequest = {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  slug: string | null;
  reason: string;
  created_at: string;
  article: {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    body: string;
    status: string;
  } | null;
  editor: Editor | Editor[] | null;
};

type SpotlightEditRequest = {
  id: string;
  title: string;
  description: string;
  reason: string;
  created_at: string;
  post: { id: string; title: string; description: string } | null;
  editor: Editor | Editor[] | null;
};

const ARTICLE_REQUEST_SELECT =
  "id,title,excerpt,body,slug,reason,created_at,article:articles!article_edit_requests_article_id_fkey(id,slug,title,excerpt,body,status),editor:profiles!article_edit_requests_editor_id_fkey(username,display_name)";

const SPOTLIGHT_REQUEST_SELECT =
  "id,title,description,reason,created_at,post:spotlight_posts!spotlight_edit_requests_post_id_fkey(id,title,description),editor:profiles!spotlight_edit_requests_editor_id_fkey(username,display_name)";

function editorName(request: { editor: Editor | Editor[] | null }): string {
  const author = one(request.editor);
  if (!author) return "লেখক";
  return author.display_name?.trim() || `@${author.username}`;
}

/** One authored text beside the live one it proposes to replace. */
function Proposal({
  label,
  live,
  proposed,
  scope,
}: {
  label: string;
  live: string | null | undefined;
  proposed: string | null | undefined;
  scope: "article" | "spotlight";
}) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-muted-foreground">বর্তমান</p>
        <div className="article-body max-h-72 overflow-auto rounded-md border bg-muted/30 p-3">
          <RichTextContent markdown={live} scope={scope} Image={AuthedMediaImage} />
        </div>
      </div>
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <div className="article-body max-h-72 overflow-auto rounded-md border border-primary/40 bg-primary/5 p-3">
          {/* The proposal is not live yet, so its pictures are still private to the author. */}
          <RichTextContent
            markdown={proposed}
            scope={scope}
            Image={AuthedMediaImage}
          />
        </div>
      </div>
    </div>
  );
}

export function PendingEdits() {
  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [articles, setArticles] = React.useState<ArticleEditRequest[]>([]);
  const [spotlights, setSpotlights] = React.useState<SpotlightEditRequest[]>([]);
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) {
        setError(
          errorMessage(
            "pending edits session",
            authError,
            "অনুমতি যাচাই করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        setAllowed(false);
        return;
      }
      if (!user) {
        setAllowed(false);
        return;
      }
      const { data: role, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (roleError) {
        setError(
          errorMessage(
            "pending edits role lookup",
            roleError,
            "অনুমতি যাচাই করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        setAllowed(false);
        return;
      }
      const roleName = (role as { role?: string } | null)?.role ?? "reader";
      if (roleName !== "moderator" && roleName !== "admin") {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      // Oldest first: an author waiting on a correction should not be overtaken by a newer one.
      const [articleResult, spotlightResult] = await Promise.all([
        supabase
          .from("article_edit_requests")
          .select(ARTICLE_REQUEST_SELECT)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(60),
        supabase
          .from("spotlight_edit_requests")
          .select(SPOTLIGHT_REQUEST_SELECT)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(60),
      ]);
      if (articleResult.error) {
        setError(
          errorMessage(
            "article edit requests",
            articleResult.error,
            "অনুমোদনের অপেক্ষায় সম্পাদনার তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      if (spotlightResult.error) {
        setError(
          errorMessage(
            "spotlight edit requests",
            spotlightResult.error,
            "স্পটলাইট সম্পাদনার তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      setArticles(
        (articleResult.data as unknown as ArticleEditRequest[]) ?? [],
      );
      setSpotlights(
        (spotlightResult.data as unknown as SpotlightEditRequest[]) ?? [],
      );
    } catch (err) {
      setError(
        errorMessage(
          "pending edits",
          err,
          "অনুমোদনের অপেক্ষায় সম্পাদনার তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।",
        ),
      );
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function decide(
    kind: "article" | "spotlight",
    id: string,
    decision: "approve" | "reject",
  ) {
    const reason = (reasons[id] ?? "").trim();
    if (reason.length < 3) {
      setError("সিদ্ধান্তের কারণ লিখুন (অন্তত ৩ অক্ষর)।");
      return;
    }
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const supabase = supabaseBrowser();
      const result =
        kind === "article"
          ? await supabase.rpc("moderate_article_edit", {
              p_request_id: id,
              p_decision: decision,
              p_reason: reason,
            })
          : await supabase.rpc("moderate_spotlight_edit", {
              p_request_id: id,
              p_decision: decision,
              p_reason: reason,
            });
      if (result.error) {
        setError(
          errorMessage(
            "pending edit decision",
            result.error,
            "সিদ্ধান্ত নথিভুক্ত করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      // An approved edit has just rewritten writing that is already live, so the cached copies of
      // the pages showing it are invalidated here — the same call the moderation queue makes for an
      // approval, because it is the same consequence.
      void revalidateReaders();
      setReasons((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setNotice(
        decision === "approve"
          ? "সম্পাদনা অনুমোদিত ও প্রকাশিত হয়েছে।"
          : "সম্পাদনা প্রত্যাখ্যান করা হয়েছে।",
      );
      await load();
    } catch (err) {
      setError(
        errorMessage(
          "pending edit decision",
          err,
          "সিদ্ধান্ত নথিভুক্ত করা যায়নি। আবার চেষ্টা করুন।",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  if (allowed === null) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          অনুমতি যাচাই করা হচ্ছে…
        </CardContent>
      </Card>
    );
  }

  if (!allowed) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {error ? (
            <p className="text-destructive" role="alert">
              {error}
            </p>
          ) : (
            "এই ডেস্ক কেবল মডারেটর ও অ্যাডমিনদের জন্য।"
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm text-success" role="status">
          {notice}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            অনুমোদনের অপেক্ষায় সম্পাদনা ({bn(articles.length)})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {articles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              প্রকাশিত কোনো প্রতিবেদনের সম্পাদনা অনুমোদনের অপেক্ষায় নেই।
            </p>
          )}
          {articles.map((request) => (
            <article key={request.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{request.article?.title ?? "প্রতিবেদন"}</span>
                <span aria-hidden>·</span>
                <span>/{request.article?.slug ?? ""}</span>
                <span aria-hidden>·</span>
                <span>{editorName(request)}</span>
                <span aria-hidden>·</span>
                <time>{formatDateBn(request.created_at)}</time>
              </div>
              {request.article && request.title !== request.article.title && (
                <p className="mt-1 text-sm">
                  শিরোনাম: “{request.article.title}” → “{request.title}”
                </p>
              )}
              {request.slug && request.article && request.slug !== request.article.slug && (
                <p className="mt-1 text-sm">
                  ঠিকানা: /{request.article.slug} → /{request.slug}
                </p>
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                কারণ: {request.reason}
              </p>
              <div className="mt-3">
                <Proposal
                  label="প্রস্তাবিত"
                  live={request.article?.body}
                  proposed={request.body}
                  scope="article"
                />
              </div>
              <div className="mt-3 grid gap-2">
                <Field
                  label="সিদ্ধান্তের কারণ (আবশ্যক)"
                  htmlFor={`ereason-${request.id}`}
                  hint="কারণ লেখকের কাছে পৌঁছায় ও অডিট লগে সংরক্ষিত হয়।"
                >
                  <Textarea
                    id={`ereason-${request.id}`}
                    value={reasons[request.id] ?? ""}
                    onChange={(e) =>
                      setReasons({ ...reasons, [request.id]: e.target.value })
                    }
                    rows={2}
                    minLength={3}
                    maxLength={500}
                    required
                  />
                </Field>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy === request.id}
                    onClick={() => void decide("article", request.id, "approve")}
                  >
                    অনুমোদন করে প্রকাশ করুন
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy === request.id}
                    onClick={() => void decide("article", request.id, "reject")}
                  >
                    প্রত্যাখ্যান
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            স্পটলাইট সম্পাদনার অপেক্ষায় ({bn(spotlights.length)})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {spotlights.length === 0 && (
            <p className="text-sm text-muted-foreground">
              প্রকাশিত কোনো স্পটলাইট পোস্টের সম্পাদনা অনুমোদনের অপেক্ষায় নেই।
            </p>
          )}
          {spotlights.map((request) => (
            <article key={request.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{request.post?.title ?? "স্পটলাইট পোস্ট"}</span>
                <span aria-hidden>·</span>
                <span>{editorName(request)}</span>
                <span aria-hidden>·</span>
                <time>{formatDateBn(request.created_at)}</time>
              </div>
              {request.post && request.title !== request.post.title && (
                <p className="mt-1 text-sm">
                  শিরোনাম: “{request.post.title}” → “{request.title}”
                </p>
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                কারণ: {request.reason}
              </p>
              <div className="mt-3">
                <Proposal
                  label="প্রস্তাবিত"
                  live={request.post?.description}
                  proposed={request.description}
                  scope="spotlight"
                />
              </div>
              <div className="mt-3 grid gap-2">
                <Field
                  label="সিদ্ধান্তের কারণ (আবশ্যক)"
                  htmlFor={`sereason-${request.id}`}
                  hint="কারণ লেখকের কাছে পৌঁছায় ও অডিট লগে সংরক্ষিত হয়।"
                >
                  <Textarea
                    id={`sereason-${request.id}`}
                    value={reasons[request.id] ?? ""}
                    onChange={(e) =>
                      setReasons({ ...reasons, [request.id]: e.target.value })
                    }
                    rows={2}
                    minLength={3}
                    maxLength={500}
                    required
                  />
                </Field>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy === request.id}
                    onClick={() =>
                      void decide("spotlight", request.id, "approve")
                    }
                  >
                    অনুমোদন করে প্রকাশ করুন
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy === request.id}
                    onClick={() =>
                      void decide("spotlight", request.id, "reject")
                    }
                  >
                    প্রত্যাখ্যান
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
