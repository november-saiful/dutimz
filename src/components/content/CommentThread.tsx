/**
 * Phase 4 Comment Thread — renders a tree of comments with nested replies,
 * like/dislike reactions, and an inline reply form. Fully bilingual.
 */
"use client";

import { useState, useCallback } from "react";
import type { Comment } from "@/types";
import { useLocaleStore } from "@/stores/locale";

// ── Copy ────────────────────────────────────────────────────────────
const COPY = {
  bn: {
    title: "মন্তব্য",
    reply: "উত্তর দিন",
    cancel: "বাতিল",
    submit: "পাঠান",
    placeholder: "আপনার মন্তব্য লিখুন…",
    namePlaceholder: "আপনার নাম",
    noComments: "এখনো কোনো মন্তব্য নেই। প্রথম মন্তব্য করুন!",
    loadMore: "আরো মন্তব্য দেখুন",
    replyingTo: "উত্তর দিচ্ছেন",
    anonymous: "অজ্ঞাত",
    signInToComment: "মন্তব্য করতে লগইন করুন",
  },
  en: {
    title: "Comments",
    reply: "Reply",
    cancel: "Cancel",
    submit: "Submit",
    placeholder: "Write your comment…",
    namePlaceholder: "Your name",
    noComments: "No comments yet. Be the first!",
    loadMore: "Show more comments",
    replyingTo: "Replying to",
    anonymous: "Anonymous",
    signInToComment: "Log in to comment",
  },
} as const;

// ── Single comment node ─────────────────────────────────────────────

function CommentNode({
  comment,
  locale,
  depth,
  onReact,
  onReply,
}: {
  comment: Comment;
  locale: "bn" | "en";
  depth: number;
  onReact: (id: string, reaction: "like" | "dislike") => void;
  onReply: (parentId: string) => void;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyName, setReplyName] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const t = COPY[locale];
  const maxDepth = 3;

  const handleSubmitReply = useCallback(async () => {
    if (!replyBody.trim() || !replyName.trim()) return;
    setReplying(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId: comment.content_id,
          parentId: comment.id,
          authorName: replyName.trim(),
          body: replyBody.trim(),
        }),
      });
      if (res.ok) {
        setShowReplyForm(false);
        setReplyBody("");
        // Trigger re-render via parent
        onReply(comment.id);
      }
    } finally {
      setReplying(false);
    }
  }, [replyBody, replyName, comment, onReply]);

  return (
    <div
      className={`border-l-2 pl-4 ${depth > 0 ? "ml-4 mt-3" : "mt-5"}`}
      style={{ borderColor: `var(--md-sys-color-${depth === 0 ? "primary" : "outline"})` }}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "var(--md-sys-color-tertiary)" }}>
          {(comment.author_name ?? t.anonymous).charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-semibold">{comment.author_name ?? t.anonymous}</span>
        <span className="text-xs opacity-50">{formatRelative(comment.created_at, locale)}</span>
      </div>

      <p className="mt-2 text-sm leading-relaxed opacity-85">{comment.body}</p>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onReact(comment.id, "like")}
          className="flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Like"
        >
          👍 {comment.likes > 0 && comment.likes}
        </button>
        <button
          type="button"
          onClick={() => onReact(comment.id, "dislike")}
          className="flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dislike"
        >
          👎 {comment.dislikes > 0 && comment.dislikes}
        </button>
        {depth < maxDepth && (
          <button
            type="button"
            onClick={() => setShowReplyForm(!showReplyForm)}
            className="text-xs font-medium opacity-60 hover:opacity-100 transition-opacity"
          >
            {t.reply}
          </button>
        )}
      </div>

      {showReplyForm && (
        <div className="mt-3 space-y-2 rounded-lg p-3" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
          <p className="text-xs opacity-60">{t.replyingTo} {comment.author_name ?? t.anonymous}</p>
          <input
            type="text"
            value={replyName}
            onChange={(e) => setReplyName(e.target.value)}
            placeholder={t.namePlaceholder}
            className="w-full rounded-lg border border-white/30 bg-white/50 px-3 py-2 text-sm outline-none focus:border-primary dark:bg-black/30"
          />
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder={t.placeholder}
            rows={2}
            className="w-full resize-none rounded-lg border border-white/30 bg-white/50 px-3 py-2 text-sm outline-none focus:border-primary dark:bg-black/30"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowReplyForm(false)}
              className="rounded-lg px-3 py-1.5 text-xs opacity-60 hover:opacity-100"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleSubmitReply}
              disabled={replying || !replyBody.trim() || !replyName.trim()}
              className="rounded-lg px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: "var(--md-sys-color-primary)" }}
            >
              {t.submit}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Full comment section ────────────────────────────────────────────

export function CommentThread({
  contentId,
  comments: initialComments,
}: {
  contentId: string;
  comments: Comment[];
}) {
  const locale = useLocaleStore((s) => s.locale);
  const [comments, setComments] = useState(initialComments);
  const [newCommentName, setNewCommentName] = useState("");
  const [newCommentBody, setNewCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const t = COPY[locale];

  const refreshComments = useCallback(async () => {
    const res = await fetch(`/api/comments?contentId=${contentId}`);
    if (res.ok) {
      const data = await res.json();
      setComments(data.comments ?? []);
    }
  }, [contentId]);

  const handleReact = useCallback(async (commentId: string, reaction: "like" | "dislike") => {
    await fetch("/api/comments/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId, reaction }),
    });
    // Optimistic update
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, [reaction === "like" ? "likes" : "dislikes"]: c[reaction === "like" ? "likes" : "dislikes"] + 1 }
          : c,
      ),
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!newCommentBody.trim() || !newCommentName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          authorName: newCommentName.trim(),
          body: newCommentBody.trim(),
        }),
      });
      if (res.ok) {
        setNewCommentBody("");
        setShowForm(false);
        await refreshComments();
      }
    } finally {
      setSubmitting(false);
    }
  }, [contentId, newCommentBody, newCommentName, refreshComments]);

  // Build tree
  const topLevel = comments.filter((c) => !c.parent_id);
  const childrenMap = new Map<string, Comment[]>();
  comments.forEach((c) => {
    if (c.parent_id) {
      const list = childrenMap.get(c.parent_id) ?? [];
      list.push(c);
      childrenMap.set(c.parent_id, list);
    }
  });

  function renderTree(parentId: string | null, depth: number): React.ReactNode {
    const items = parentId === null ? topLevel : (childrenMap.get(parentId) ?? []);
    return items.map((c) => (
      <div key={c.id}>
        <CommentNode
          comment={c}
          locale={locale}
          depth={depth}
          onReact={handleReact}
          onReply={() => refreshComments()}
        />
        {renderTree(c.id, depth + 1)}
      </div>
    ));
  }

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-lg font-bold flex items-center gap-2">
        {t.title}
        <span className="text-sm font-normal opacity-50">({comments.length})</span>
      </h2>

      {comments.length === 0 && (
        <p className="text-sm opacity-50 py-4">{t.noComments}</p>
      )}

      <div className="space-y-1">
        {renderTree(null, 0)}
      </div>

      {/* New comment form */}
      <div className="mt-6">
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="w-full rounded-xl border-2 border-dashed p-4 text-sm opacity-60 hover:opacity-100 transition-opacity text-left"
            style={{ borderColor: "var(--md-sys-color-outline)" }}
          >
            ✍️ {t.placeholder}
          </button>
        ) : (
          <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
            <input
              type="text"
              value={newCommentName}
              onChange={(e) => setNewCommentName(e.target.value)}
              placeholder={t.namePlaceholder}
              className="w-full rounded-lg border border-white/30 bg-white/50 px-3 py-2.5 text-sm outline-none focus:border-primary dark:bg-black/30"
            />
            <textarea
              value={newCommentBody}
              onChange={(e) => setNewCommentBody(e.target.value)}
              placeholder={t.placeholder}
              rows={3}
              className="w-full resize-none rounded-lg border border-white/30 bg-white/50 px-3 py-2.5 text-sm outline-none focus:border-primary dark:bg-black/30"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowForm(false); setNewCommentBody(""); }}
                className="rounded-lg px-4 py-2 text-sm opacity-60 hover:opacity-100"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !newCommentBody.trim() || !newCommentName.trim()}
                className="rounded-lg px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "var(--md-sys-color-primary)" }}
              >
                {t.submit}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatRelative(iso: string, locale: "bn" | "en"): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return locale === "bn" ? "এইমাত্র" : "just now";
  if (minutes < 60) return locale === "bn" ? `${minutes} মিনিট আগে` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "bn" ? `${hours} ঘণ্টা আগে` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return locale === "bn" ? `${days} দিন আগে` : `${days}d ago`;
}
