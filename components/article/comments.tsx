"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** The only reader identity comments need: the author's own id. */
type SessionUser = { id: string };

import { Field, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { rememberReturnPath, signInWithGoogle } from "@/lib/auth-client";
import { errorMessage, reportError } from "@/lib/errors";
import { one, supabaseBrowser } from "@/lib/supabase";
import { bn, relativeTimeBn } from "@/lib/site";
import { cn } from "@/lib/utils";

type CommentProfile = { username: string; display_name: string };

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  profiles: CommentProfile | CommentProfile[] | null;
};

type Score = { score: number; upvotes: number; downvotes: number };

type SortKey = "best" | "top" | "new" | "old" | "controversial";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "best", label: "সেরা" },
  { value: "top", label: "সর্বাধিক ভোট" },
  { value: "new", label: "নতুন" },
  { value: "old", label: "পুরনো" },
  { value: "controversial", label: "বিতর্কিত" },
];

type CommentNode = {
  comment: CommentRow;
  children: CommentNode[];
};

function buildTree(rows: CommentRow[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  for (const row of rows) byId.set(row.id, { comment: row, children: [] });
  const roots: CommentNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    if (!node) continue;
    if (row.parent_id && byId.has(row.parent_id)) {
      byId.get(row.parent_id)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function sortTree(
  nodes: CommentNode[],
  sort: SortKey,
  scores: Record<string, Score>,
): CommentNode[] {
  const scoreOf = (node: CommentNode) => scores[node.comment.id] ?? { score: 0, upvotes: 0, downvotes: 0 };
  const timeOf = (node: CommentNode) => new Date(node.comment.created_at).getTime();
  const sorted = [...nodes].sort((a, b) => {
    const sa = scoreOf(a);
    const sb = scoreOf(b);
    switch (sort) {
      case "new":
        return timeOf(b) - timeOf(a);
      case "old":
        return timeOf(a) - timeOf(b);
      case "controversial": {
        const totalA = sa.upvotes + sa.downvotes;
        const totalB = sb.upvotes + sb.downvotes;
        if (totalB !== totalA) return totalB - totalA;
        return Math.abs(sa.score) - Math.abs(sb.score);
      }
      case "top":
        if (sb.score !== sa.score) return sb.score - sa.score;
        return timeOf(a) - timeOf(b);
      case "best":
      default:
        if (sb.score !== sa.score) return sb.score - sa.score;
        return timeOf(b) - timeOf(a);
    }
  });
  return sorted.map((node) => ({ ...node, children: sortTree(node.children, sort, scores) }));
}

function countNodes(nodes: CommentNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

export function Comments({ articleId }: { articleId: string }) {
  const [rows, setRows] = React.useState<CommentRow[]>([]);
  const [scores, setScores] = React.useState<Record<string, Score>>({});
  const [myVotes, setMyVotes] = React.useState<Record<string, 1 | -1>>({});
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [sort, setSort] = React.useState<SortKey>("best");
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [replyDraft, setReplyDraft] = React.useState("");
  const [replyBusy, setReplyBusy] = React.useState(false);
  const [voting, setVoting] = React.useState<string | null>(null);
  /* A signed-out press opens the sign-in popover by the comment itself; this
   * is the comment it is anchored to, or null when no prompt is showing. */
  const [gateComment, setGateComment] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const supabase = supabaseBrowser();
      const listed = await supabase
        .from("comments")
        .select(
          "id,body,created_at,parent_id,profiles:profiles!comments_author_id_fkey(username,display_name)",
        )
        .eq("article_id", articleId)
        .eq("status", "visible")
        .order("created_at", { ascending: true })
        .limit(500);
      if (listed.error) {
        reportError("comment list", listed.error);
        setError("মন্তব্যগুলো এখন লোড করা যাচ্ছে না।");
        return;
      }
      const data = (listed.data ?? []) as unknown as CommentRow[];
      setRows(data);

      // Public aggregates; missing RPC (pre-migration) just means zeros.
      try {
        const result = await supabase.rpc("get_comment_scores", { p_article_id: articleId });
        if (!result.error && Array.isArray(result.data)) {
          const next: Record<string, Score> = {};
          for (const row of result.data as { comment_id: string; upvotes: number; downvotes: number; score: number }[]) {
            next[row.comment_id] = {
              score: Number(row.score) || 0,
              upvotes: Number(row.upvotes) || 0,
              downvotes: Number(row.downvotes) || 0,
            };
          }
          setScores(next);
        }
      } catch (err) {
        reportError("comment scores", err);
      }

      const { data: { user: current }, error: authError } = await supabase.auth.getUser();
      if (!authError) setUser(current);
      if (current && data && data.length > 0) {
        try {
          const votes = await supabase
            .from("comment_votes")
            .select("comment_id,value")
            .in(
              "comment_id",
              data.map((row) => row.id),
            );
          if (!votes.error && Array.isArray(votes.data)) {
            const mine: Record<string, 1 | -1> = {};
            for (const row of votes.data as { comment_id: string; value: number }[]) {
              if (row.value === 1 || row.value === -1) mine[row.comment_id] = row.value;
            }
            setMyVotes(mine);
          }
        } catch (err) {
          reportError("comment vote state", err);
        }
      } else {
        setMyVotes({});
      }
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

  async function requireUser(): Promise<SessionUser | null> {
    const supabase = supabaseBrowser();
    const { data: { user: current }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!current) {
      // Reddit-style gate: only signed-in readers may write. There is no
      // sign-in page, so the reader goes straight to Google and back here.
      rememberReturnPath();
      const { error: oauthError } = await signInWithGoogle();
      if (oauthError) throw oauthError;
      return null;
    }
    setUser(current);
    return current;
  }

  async function signIn() {
    try {
      rememberReturnPath();
      const { error: oauthError } = await signInWithGoogle();
      if (oauthError) {
        setError(errorMessage("comment sign-in", oauthError, "প্রবেশ করা যায়নি। আবার চেষ্টা করুন।"));
      }
    } catch (err) {
      setError(errorMessage("comment sign-in", err, "প্রবেশ করা যায়নি। আবার চেষ্টা করুন।"));
    }
  }

  async function submitTopLevel(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const current = await requireUser();
      if (!current) return;
      const supabase = supabaseBrowser();
      const result = await supabase.from("comments").insert({
        article_id: articleId,
        author_id: current.id,
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

  async function submitReply(parentId: string) {
    const body = replyDraft.trim();
    if (!body || replyBusy) return;
    setReplyBusy(true);
    setError("");
    try {
      const current = await requireUser();
      if (!current) return;
      const supabase = supabaseBrowser();
      const result = await supabase.from("comments").insert({
        article_id: articleId,
        author_id: current.id,
        body,
        parent_id: parentId,
      });
      if (result.error) {
        setError(
          errorMessage(
            "comment reply",
            result.error,
            "জবাব পাঠানো যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      setReplyDraft("");
      setReplyTo(null);
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
      await load();
    } catch (err) {
      setError(errorMessage("comment reply", err, "জবাব পাঠানো যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setReplyBusy(false);
    }
  }

  async function voteComment(commentId: string, target: 1 | -1) {
    if (voting) return;
    // Deciding who may vote needs no round-trip: the session is already in
    // state from the list load. A signed-out press is answered here with the
    // sign-in popover, not a detour to Google the reader did not ask for.
    if (!user) {
      rememberReturnPath();
      setGateComment(commentId);
      return;
    }
    setVoting(commentId);
    try {
      const current = user;
      const supabase = supabaseBrowser();
      const previous = myVotes[commentId] ?? null;
      if (previous === target) {
        const cleared = await supabase.from("comment_votes").delete().eq("comment_id", commentId);
        if (cleared.error) {
          setError(errorMessage("comment vote", cleared.error, "ভোট সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
          return;
        }
        setMyVotes((prev) => {
          const next = { ...prev };
          delete next[commentId];
          return next;
        });
        setScores((prev) => {
          const entry = prev[commentId] ?? { score: 0, upvotes: 0, downvotes: 0 };
          return {
            ...prev,
            [commentId]: {
              score: entry.score - target,
              upvotes: entry.upvotes - (target === 1 ? 1 : 0),
              downvotes: entry.downvotes - (target === -1 ? 1 : 0),
            },
          };
        });
      } else {
        const saved = await supabase.from("comment_votes").upsert(
          { comment_id: commentId, user_id: current.id, value: target },
          { onConflict: "comment_id,user_id" },
        );
        if (saved.error) {
          setError(errorMessage("comment vote", saved.error, "ভোট সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
          return;
        }
        setMyVotes((prev) => ({ ...prev, [commentId]: target }));
        setScores((prev) => {
          const entry = prev[commentId] ?? { score: 0, upvotes: 0, downvotes: 0 };
          return {
            ...prev,
            [commentId]: {
              score: entry.score + target - (previous ?? 0),
              upvotes: entry.upvotes + (target === 1 ? 1 : 0) - (previous === 1 ? 1 : 0),
              downvotes: entry.downvotes + (target === -1 ? 1 : 0) - (previous === -1 ? 1 : 0),
            },
          };
        });
      }
    } catch (err) {
      setError(errorMessage("comment vote", err, "ভোট সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setVoting(null);
    }
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const tree = React.useMemo(() => sortTree(buildTree(rows), sort, scores), [rows, sort, scores]);
  const total = countNodes(tree);

  function renderNode(node: CommentNode, depth: number): React.ReactNode {
    const { comment } = node;
    const author = one(comment.profiles) ?? { username: "reader", display_name: "পাঠক" };
    const name = author.display_name?.trim() || `@${author.username || "পাঠক"}`;
    const entry = scores[comment.id] ?? { score: 0, upvotes: 0, downvotes: 0 };
    const mine = myVotes[comment.id] ?? null;
    const isCollapsed = collapsed.has(comment.id);
    const replyCount = countNodes(node.children);

    return (
      <div key={comment.id} className="rc-item">
        <div className="rc-rail">
          <button
            type="button"
            className={cn("rc-vote", mine === 1 && "voted-up")}
            onClick={() => voteComment(comment.id, 1)}
            disabled={voting === comment.id}
            aria-pressed={mine === 1}
            aria-label={mine === 1 ? "আপভোট সরান" : "আপভোট দিন"}
          >
            <ArrowBigUp className="size-5" />
          </button>
          <span
            className={cn(
              "rc-score",
              mine === 1 && "voted-up",
              mine === -1 && "voted-down",
            )}
            aria-label={`${bn(entry.score)} স্কোর`}
          >
            {bn(entry.score)}
          </span>
          <button
            type="button"
            className={cn("rc-vote", mine === -1 && "voted-down")}
            onClick={() => voteComment(comment.id, -1)}
            disabled={voting === comment.id}
            aria-pressed={mine === -1}
            aria-label={mine === -1 ? "ডাউনভোট সরান" : "ডাউনভোট দিন"}
          >
            <ArrowBigDown className="size-5" />
          </button>
          <Popover
            open={gateComment === comment.id}
            onOpenChange={(open) => {
              if (!open) setGateComment(null);
            }}
          >
            <PopoverTrigger className="sr-only" aria-hidden tabIndex={-1} />
            <PopoverContent className="w-72 text-popover-foreground">
              <p className="text-sm font-medium">ভোট দিতে প্রথমে প্রবেশ করুন</p>
              <p className="mt-1 text-xs text-muted-foreground">
                গুগল দিয়ে প্রবেশ করলে আপনার ভোটই এই মন্তব্যে গোনা হবে।
              </p>
              <button
                type="button"
                onClick={() => void signIn()}
                className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                গুগল দিয়ে প্রবেশ করুন
              </button>
            </PopoverContent>
          </Popover>
        </div>
        <div className="rc-body">
          <div className="rc-meta">
            <Link href={`/u/${encodeURIComponent(author.username)}/`} className="rc-author">
              {name}
            </Link>
            <span aria-hidden>•</span>
            <time dateTime={comment.created_at}>{relativeTimeBn(comment.created_at)}</time>
            {node.children.length > 0 && (
              <button type="button" className="rc-collapse" onClick={() => toggleCollapse(comment.id)}>
                {isCollapsed ? `[+] ${bn(replyCount)}টি জবাব` : "[–] লুকান"}
              </button>
            )}
          </div>
          {!isCollapsed && (
            <>
              <p className="rc-text wrap-break-word">{comment.body}</p>
              <div className="rc-actions">
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(replyTo === comment.id ? null : comment.id);
                    setReplyDraft("");
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  জবাব দিন
                </button>
              </div>
              {replyTo === comment.id && (
                <div className="rc-reply">
                  {user ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitReply(comment.id);
                      }}
                    >
                      <Textarea
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        maxLength={2000}
                        required
                        rows={2}
                        placeholder="জবাব লিখুন…"
                        aria-label="জবাব লিখুন"
                      />
                      <div className="rc-reply-actions">
                        <Button type="submit" disabled={replyBusy} size="sm">
                          {replyBusy ? "প্রকাশ হচ্ছে…" : "জবাব দিন"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReplyTo(null);
                            setReplyDraft("");
                          }}
                        >
                          বাতিল
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="rc-login">
                      জবাব দিতে <button type="button" onClick={signIn}>প্রবেশ করুন</button>।
                    </div>
                  )}
                </div>
              )}
              {node.children.length > 0 && (
                <div className="rc-children" data-depth={Math.min(depth + 1, 8)}>
                  {node.children.map((child) => renderNode(child, depth + 1))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="rc-toolbar">
        <span className="rc-count" aria-live="polite">
          {bn(total)}টি মন্তব্য
        </span>
        <label className="rc-sort">
          সাজান:
          <span className="rc-sort-control">
            <Select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="মন্তব্য সাজান">
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </span>
        </label>
      </div>

      {user ? (
        <form onSubmit={submitTopLevel} className="rc-composer">
          <Field label="আপনার মন্তব্য" htmlFor="comment-body" hideLabel>
            <Textarea
              id="comment-body"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={2000}
              required
              rows={3}
              placeholder="আলোচনায় যোগ দিন…"
            />
          </Field>
          <div className="rc-composer-actions">
            <Button type="submit" disabled={submitting} className="self-start">
              {submitting ? "প্রকাশ হচ্ছে…" : "মন্তব্য করুন"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="rc-gate">
          <p>মন্তব্য করতে প্রবেশ করতে হবে।</p>
          <Button type="button" onClick={signIn}>
            গুগল দিয়ে প্রবেশ করুন
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-2">
          <FormMessage>{error}</FormMessage>
        </div>
      )}

      <div className="rc-list">
        {!loaded && <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>}
        {loaded && tree.length === 0 && (
          <div className="rc-empty">
            <strong>আলোচনা শুরু করুন</strong>
            <p>শ্রদ্ধাশীল ভাষায় প্রথম মন্তব্যটি লিখুন।</p>
          </div>
        )}
        {tree.map((node) => renderNode(node, 0))}
      </div>
    </div>
  );
}
