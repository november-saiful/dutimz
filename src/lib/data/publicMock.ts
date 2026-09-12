/**
 * Phase 4 mock data: comments, bookmarks, newsletter subscribers.
 * Uses globalThis so all route bundles in dev share the same store.
 */
import type { Comment } from "@/types";

const g = globalThis as Record<string, unknown>;
if (!g.__dutimz_public_store) {
  g.__dutimz_public_store = { comments: [] as Comment[], bookmarks: new Map<string, Set<string>>(), subscribers: [] as { email: string; locale: string; createdAt: string }[] };
}
const store = g.__dutimz_public_store as {
  comments: Comment[];
  bookmarks: Map<string, Set<string>>;
  subscribers: { email: string; locale: string; createdAt: string }[];
};

// ── Seed a handful of demo comments ────────────────────────────────
if (store.comments.length === 0) {
  const now = Date.now();
  const demo: Comment[] = [
    {
      id: "cm1",
      content_id: "1",
      parent_id: null,
      author_id: null,
      author_name: "রহিম উদ্দিন",
      author_avatar: null,
      body: "খুব ভালো সংবাদ। বাংলায় এমন পোর্টাল প্রয়োজন ছিল।",
      status: "approved",
      likes: 12,
      dislikes: 0,
      depth: 0,
      created_at: new Date(now - 3600_000).toISOString(),
      updated_at: new Date(now - 3600_000).toISOString(),
    },
    {
      id: "cm2",
      content_id: "1",
      parent_id: "cm1",
      author_id: null,
      author_name: "ফাতিমা খানম",
      author_avatar: null,
      body: "সম্মত! দ্বিভাষিক হওয়া অনেক ভালো।",
      status: "approved",
      likes: 5,
      dislikes: 0,
      depth: 1,
      created_at: new Date(now - 1800_000).toISOString(),
      updated_at: new Date(now - 1800_000).toISOString(),
    },
    {
      id: "cm3",
      content_id: "1",
      parent_id: null,
      author_id: null,
      author_name: "করিম সাহেব",
      author_avatar: null,
      body: "আমি ঢাকা বিশ্ববিদ্যালয়ের ছাত্র। এই পোর্টাল আমাদের জন্য অনেক কাজের।",
      status: "approved",
      likes: 8,
      dislikes: 1,
      depth: 0,
      created_at: new Date(now - 900_000).toISOString(),
      updated_at: new Date(now - 900_000).toISOString(),
    },
    {
      id: "cm4",
      content_id: "2",
      parent_id: null,
      author_id: null,
      author_name: "তানভীর আহমেদ",
      author_avatar: null,
      body: "মেট্রোরেলের নতুন সময়সূচি নিয়ে আমার অনেক খুশি। অফিসে যাওয়া এখন সহজ হবে।",
      status: "approved",
      likes: 15,
      dislikes: 0,
      depth: 0,
      created_at: new Date(now - 7200_000).toISOString(),
      updated_at: new Date(now - 7200_000).toISOString(),
    },
    {
      id: "cm5",
      content_id: "4",
      parent_id: null,
      author_id: null,
      author_name: "সুমন দাস",
      author_avatar: null,
      body: "নিউজরুমে AI নিয়ে ভালো বিশ্লেষণ। তবে সম্পাদকদের ভূমিকা কমবে না।",
      status: "approved",
      likes: 6,
      dislikes: 2,
      depth: 0,
      created_at: new Date(now - 5400_000).toISOString(),
      updated_at: new Date(now - 5400_000).toISOString(),
    },
  ];
  store.comments.push(...demo);
}

// ── Comments ───────────────────────────────────────────────────────

export function getCommentsByContentId(contentId: string): Comment[] {
  return store.comments
    .filter((c) => c.content_id === contentId && c.status === "approved")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function addComment(input: {
  contentId: string;
  parentId?: string | null;
  authorName: string;
  body: string;
}): Comment {
  const parent = input.parentId ? store.comments.find((c) => c.id === input.parentId) : null;
  const depth = parent ? Math.min(parent.depth + 1, 3) : 0;
  const now = new Date().toISOString();
  const comment: Comment = {
    id: `cm${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    content_id: input.contentId,
    parent_id: input.parentId ?? null,
    author_id: null,
    author_name: input.authorName,
    author_avatar: null,
    body: input.body,
    status: "approved",
    likes: 0,
    dislikes: 0,
    depth,
    created_at: now,
    updated_at: now,
  };
  store.comments.push(comment);
  return comment;
}

export function reactToComment(
  commentId: string,
  reaction: "like" | "dislike",
): Comment | null {
  const comment = store.comments.find((c) => c.id === commentId);
  if (!comment) return null;
  if (reaction === "like") comment.likes += 1;
  else comment.dislikes += 1;
  return comment;
}

// ── Bookmarks ──────────────────────────────────────────────────────

export function isBookmarked(userId: string, contentId: string): boolean {
  return store.bookmarks.get(userId)?.has(contentId) ?? false;
}

export function toggleBookmark(userId: string, contentId: string): boolean {
  if (!store.bookmarks.has(userId)) store.bookmarks.set(userId, new Set());
  const set = store.bookmarks.get(userId)!;
  if (set.has(contentId)) {
    set.delete(contentId);
    return false;
  }
  set.add(contentId);
  return true;
}

export function getBookmarkIds(userId: string): string[] {
  return Array.from(store.bookmarks.get(userId) ?? []);
}

// ── Newsletter ─────────────────────────────────────────────────────

export function subscribeNewsletter(email: string, locale = "bn"): { ok: boolean; message: string } {
  const existing = store.subscribers.find((s) => s.email === email);
  if (existing) {
    if (existing.locale !== locale) existing.locale = locale;
    return { ok: true, message: "already_subscribed" };
  }
  store.subscribers.push({ email, locale, createdAt: new Date().toISOString() });
  return { ok: true, message: "subscribed" };
}
