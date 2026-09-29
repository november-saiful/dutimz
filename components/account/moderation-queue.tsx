"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { supabaseBrowser } from "@/lib/supabase";
import { formatDateBn } from "@/lib/site";

type PendingArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  created_at: string;
  is_anonymous: boolean;
  category: { slug: string; title_bn: string } | null;
};

type FlaggedComment = {
  id: string;
  body: string;
  created_at: string;
  status: string;
  articles: { title: string } | null;
};

export function ModerationQueue() {
  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [articles, setArticles] = React.useState<PendingArticle[]>([]);
  const [comments, setComments] = React.useState<FlaggedComment[]>([]);
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAllowed(false);
        return;
      }
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      const roleName = (role as { role?: string } | null)?.role ?? "reader";
      if (roleName !== "moderator" && roleName !== "admin") {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      const [pendingResult, commentResult] = await Promise.all([
        supabase
          .from("articles")
          .select(
            "id,slug,title,excerpt,body,created_at,is_anonymous,category:categories(slug,title_bn)",
          )
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(60),
        supabase
          .from("comments")
          .select("id,body,created_at,status,articles(title)")
          .neq("status", "visible")
          .order("created_at", { ascending: false })
          .limit(60),
      ]);
      if (pendingResult.error) {
        setError(pendingResult.error.message);
        return;
      }
      setArticles(
        (pendingResult.data as unknown as PendingArticle[]) ?? [],
      );
      setComments(
        ((commentResult.data ?? []) as unknown as FlaggedComment[]).filter(
          (c) => c.status !== "visible",
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "লোড করা যায়নি।");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function decide(
    kind: "article" | "comment",
    id: string,
    decision: string,
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
          ? await supabase.rpc("moderate_article", {
              p_article_id: id,
              p_decision: decision,
              p_reason: reason,
            })
          : await supabase.rpc("moderate_comment", {
              p_comment_id: id,
              p_decision: decision,
              p_reason: reason,
            });
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setReasons((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setNotice("সিদ্ধান্ত নথিভুক্ত হয়েছে।");
      await load();
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
          এই ডেস্ক কেবল মডারেটর ও অ্যাডমিনদের জন্য।
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
        <p className="text-sm text-green-700" role="status">
          {notice}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            অপেক্ষমাণ প্রতিবেদন ({new Intl.NumberFormat("bn-BD").format(articles.length)})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {articles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              পর্যালোচনার অপেক্ষায় কোনো প্রতিবেদন নেই।
            </p>
          )}
          {articles.map((article) => (
            <article key={article.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{article.category?.title_bn ?? "বিভাগ"}</span>
                <span aria-hidden>·</span>
                <time>{formatDateBn(article.created_at)}</time>
                {article.is_anonymous && <span>· নাম প্রকাশে অনিচ্ছুক</span>}
              </div>
              <h2 className="mt-1 font-semibold">{article.title}</h2>
              <p className="text-sm text-muted-foreground">{article.excerpt}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-primary">
                  পূর্ণ প্রতিবেদন পড়ুন
                </summary>
                <div className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">
                  {article.body}
                </div>
              </details>
              <div className="mt-3 grid gap-2">
                <Label htmlFor={`reason-${article.id}`}>
                  সিদ্ধান্তের কারণ (আবশ্যক)
                </Label>
                <textarea
                  id={`reason-${article.id}`}
                  value={reasons[article.id] ?? ""}
                  onChange={(e) =>
                    setReasons({ ...reasons, [article.id]: e.target.value })
                  }
                  rows={2}
                  minLength={3}
                  maxLength={500}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy === article.id}
                    onClick={() => void decide("article", article.id, "approve")}
                  >
                    অনুমোদন
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy === article.id}
                    onClick={() => void decide("article", article.id, "reject")}
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
            পর্যালোচনাধীন মন্তব্য ({new Intl.NumberFormat("bn-BD").format(comments.length)})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground">
              পর্যালোচনার অপেক্ষায় কোনো মন্তব্য নেই।
            </p>
          )}
          {comments.map((comment) => (
            <article key={comment.id} className="rounded-md border p-4">
              <p className="text-sm font-medium">
                {comment.articles?.title ?? "প্রতিবেদন"} · {comment.status}
              </p>
              <p className="mt-1 text-sm">{comment.body}</p>
              <div className="mt-3 grid gap-2">
                <Label htmlFor={`creason-${comment.id}`}>
                  সিদ্ধান্তের কারণ (আবশ্যক)
                </Label>
                <textarea
                  id={`creason-${comment.id}`}
                  value={reasons[comment.id] ?? ""}
                  onChange={(e) =>
                    setReasons({ ...reasons, [comment.id]: e.target.value })
                  }
                  rows={2}
                  minLength={3}
                  maxLength={500}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy === comment.id}
                    onClick={() => void decide("comment", comment.id, "restore")}
                  >
                    পুনরুদ্ধার
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === comment.id}
                    onClick={() => void decide("comment", comment.id, "hide")}
                  >
                    লুকান
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy === comment.id}
                    onClick={() => void decide("comment", comment.id, "remove")}
                  >
                    অপসারণ
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
