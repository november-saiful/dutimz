"use client";

import * as React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Field, FormMessage } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { errorMessage, reportError } from "@/lib/errors";
import { one, supabaseBrowser } from "@/lib/supabase";
import { relativeTimeBn } from "@/lib/site";

type Comment = {
  id: string;
  body: string;
  created_at: string;
  profiles: { username: string; display_name: string } | null;
};

export function Comments({ articleId }: { articleId: string }) {
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const supabase = supabaseBrowser();
      const result = await supabase
        .from("comments")
        .select(
          "id,body,created_at,profiles:profiles!comments_author_id_fkey(username,display_name)",
        )
        .eq("article_id", articleId)
        .eq("status", "visible")
        .order("created_at", { ascending: false })
        .limit(100);
      if (result.error) {
        reportError("comment list", result.error);
        setError("মন্তব্যগুলো এখন লোড করা যাচ্ছে না।");
        return;
      }
      setComments((result.data ?? []) as unknown as Comment[]);
    } catch (err) {
      reportError("comment list", err);
      setError("মন্তব্যগুলো এখন লোড করা যাচ্ছে না।");
    } finally {
      setLoaded(true);
    }
  }, [articleId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const supabase = supabaseBrowser();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        setError(errorMessage("comment session", authError, "মন্তব্য পাঠানো যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
      if (!user) {
        sessionStorage.setItem(
          "dutimz-after-auth",
          `${location.pathname}${location.search}`,
        );
        window.location.assign("/auth/sign-in");
        return;
      }
      const result = await supabase.from("comments").insert({
        article_id: articleId,
        author_id: user.id,
        body,
      });
      if (result.error) {
        setError(
          errorMessage(
            "comment submit",
            result.error,
            "মন্তব্য পাঠানো যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      setDraft("");
      await load();
    } catch (err) {
      setError(errorMessage("comment submit", err, "মন্তব্য পাঠানো যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <Field label="আপনার মন্তব্য" htmlFor="comment-body" hideLabel>
          <Textarea
            id="comment-body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2000}
            required
            rows={3}
            placeholder="শ্রদ্ধাশীল ভাষায় আপনার মতামত লিখুন…"
          />
        </Field>
        <Button type="submit" disabled={submitting} className="self-start">
          {submitting ? "প্রকাশ হচ্ছে…" : "মন্তব্য করুন →"}
        </Button>
      </form>
      {error && (
        <div className="mt-2">
          <FormMessage>{error}</FormMessage>
        </div>
      )}
      <div className="mt-4 flex flex-col gap-3">
        {!loaded && <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>}
        {loaded && comments.length === 0 && (
          <div className="rounded-md bg-muted p-4 text-sm">
            <strong>আলোচনা শুরু করুন</strong>
            <p className="text-muted-foreground">
              শ্রদ্ধাশীল ভাষায় প্রথম মন্তব্যটি লিখুন।
            </p>
          </div>
        )}
        {comments.map((comment) => {
          const author = one(comment.profiles) ?? {
            username: "reader",
            display_name: "পাঠক",
          };
          const name =
            author.display_name?.trim() || `@${author.username || "পাঠক"}`;
          return (
            <article key={comment.id} className="flex items-start gap-3">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">
                  {name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 rounded-md border p-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <strong className="min-w-0 truncate text-foreground">
                    <a href={`/u/${encodeURIComponent(author.username)}/`}>
                      {name}
                    </a>
                  </strong>
                  <span aria-hidden>·</span>
                  <time className="shrink-0">{relativeTimeBn(comment.created_at)}</time>
                </div>
                <p className="mt-1 wrap-break-word text-sm">{comment.body}</p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
