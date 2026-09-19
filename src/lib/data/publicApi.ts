/**
 * Server-side data layer for the public feature APIs: comments, reactions,
 * bookmarks, newsletter and polls.
 *
 * Every function has two paths:
 *  - **Supabase** (env configured): the real tables/RPCs from migration
 *    0001 + 0008. Reads that the public may see use the cookie-less anon
 *    client so RSC pages stay cacheable; writes use the request-scoped
 *    cookie client so RLS sees the signed-in user.
 *  - **Mock** (no env): the in-memory stores, so local development keeps
 *    working exactly as before.
 *
 * Nothing here is "process-local" in Supabase mode — the mock stores are only
 * touched when there is no database to talk to.
 */
import type { Comment, ContentWithRelations } from "@/types";
import type { Poll } from "@/components/content/PollWidget";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";
import { getAuthProfile } from "@/lib/auth/server";
import { mapCommentRow, mapCommentRows, mapPollRow, type CommentRow, type PollRow } from "@/lib/data/publicMappers";

/** Discriminated result so route handlers can map failures to status codes. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({
  ok: false,
  status,
  error,
});

/** Comments joined with the author profile (there is no `author_avatar` column). */
export const COMMENT_SELECT =
  "*, author:profiles!comments_author_id_fkey(id, username, display_name, avatar_url)";

const CONTENT_SELECT =
  "*, category:categories(*), author:profiles!contents_author_id_fkey(id, username, display_name, avatar_url, is_verified)";

/** Mock mode pretends to be this user, mirroring the old demo behaviour. */
const MOCK_USER_ID = "demo-user";

/** Re-exported so callers keep one import site for the comment contract. */
export { COMMENT_MAX_LENGTH } from "@/lib/api/schemas";

/** Map a PostgREST/Postgres error code to an HTTP status. */
function statusForErrorCode(code: string | undefined): number {
  switch (code) {
    case "42501": // insufficient_privilege — our RPCs raise this when signed out
      return 401;
    case "P0002": // no_data_found — poll/comment/option missing
      return 404;
    case "22023": // invalid_parameter_value — closed poll / bad reaction
      return 409;
    case "23505": // unique_violation — already voted
      return 409;
    default:
      return 500;
  }
}

// ── Comments ────────────────────────────────────────────────────────

export async function listComments(contentId: string): Promise<Comment[]> {
  const supabase = createSupabaseAnonClient();
  if (!supabase) {
    const { getCommentsByContentId } = await import("@/lib/data/publicMock");
    return getCommentsByContentId(contentId);
  }

  const { data, error } = await supabase
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("content_id", contentId)
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  // A non-UUID id (mock-shaped content) simply matches nothing.
  if (error || !data) return [];
  return mapCommentRows(data as CommentRow[]);
}

export async function createComment(input: {
  contentId: string;
  parentId?: string | null;
  authorName?: string | null;
  body: string;
}): Promise<ApiResult<Comment>> {
  if (!hasSupabaseEnv()) {
    const { addComment } = await import("@/lib/data/publicMock");
    return {
      ok: true,
      data: addComment({
        contentId: input.contentId,
        parentId: input.parentId ?? null,
        authorName: input.authorName?.trim() || "অতিথি",
        body: input.body,
      }),
    };
  }

  // RLS only allows inserts where author_id = auth.uid(), so commenting is
  // deliberately authenticated (the schema and the spec both require it).
  const profile = await getAuthProfile();
  if (!profile) return fail(401, "Sign in to comment");

  const supabase = createSupabaseServerClient();

  if (input.parentId) {
    const { data: parent } = await supabase
      .from("comments")
      .select("id, content_id")
      .eq("id", input.parentId)
      .maybeSingle();
    if (!parent || parent.content_id !== input.contentId) {
      return fail(400, "Parent comment does not belong to this story");
    }
  }

  const { data, error } = await supabase
    .from("comments")
    .insert({
      content_id: input.contentId,
      parent_id: input.parentId ?? null,
      author_id: profile.id,
      author_name: input.authorName?.trim() || profile.display_name || profile.username,
      body: input.body,
      status: "approved",
    })
    .select(COMMENT_SELECT)
    .single();

  if (error) return fail(statusForErrorCode(error.code), error.message);
  return { ok: true, data: mapCommentRow(data as CommentRow) };
}

export async function reactToComment(
  commentId: string,
  reaction: "like" | "dislike",
): Promise<ApiResult<Comment>> {
  if (!hasSupabaseEnv()) {
    const { reactToComment: reactMock } = await import("@/lib/data/publicMock");
    const updated = reactMock(commentId, reaction);
    return updated ? { ok: true, data: updated } : fail(404, "Comment not found");
  }

  const profile = await getAuthProfile();
  if (!profile) return fail(401, "Sign in to react to comments");

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cast_comment_reaction", {
    p_comment_id: commentId,
    p_reaction: reaction,
  });
  if (error) return fail(statusForErrorCode(error.code), error.message);
  return { ok: true, data: mapCommentRow(data as CommentRow) };
}

// ── Bookmarks ───────────────────────────────────────────────────────

/** Resolve the acting user id, or null when signed out (mock mode: demo user). */
async function actingUserId(): Promise<string | null> {
  if (!hasSupabaseEnv()) return MOCK_USER_ID;
  const profile = await getAuthProfile();
  return profile?.id ?? null;
}

export async function listBookmarkIds(): Promise<ApiResult<string[]>> {
  const userId = await actingUserId();
  if (!userId) return fail(401, "Sign in to see your bookmarks");

  if (!hasSupabaseEnv()) {
    const { getBookmarkIds } = await import("@/lib/data/publicMock");
    return { ok: true, data: getBookmarkIds(userId) };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookmarks")
    .select("content_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return fail(statusForErrorCode(error.code), error.message);
  return { ok: true, data: (data ?? []).map((row) => row.content_id as string) };
}

/** Bookmarked content with relations, newest bookmark first. */
export async function listBookmarkedContents(): Promise<ApiResult<ContentWithRelations[]>> {
  const idsResult = await listBookmarkIds();
  if (!idsResult.ok) return idsResult;
  const ids = idsResult.data;
  if (ids.length === 0) return { ok: true, data: [] };

  if (!hasSupabaseEnv()) {
    // Imported lazily so the demo dataset never ships in the production bundle.
    const { mockContents } = await import("@/lib/data/mock");
    const items = ids
      .map((id) => mockContents.find((c) => c.id === id))
      .filter(Boolean) as ContentWithRelations[];
    return { ok: true, data: items };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contents")
    .select(CONTENT_SELECT)
    .in("id", ids);
  if (error) return fail(statusForErrorCode(error.code), error.message);

  const byId = new Map((data as unknown as ContentWithRelations[]).map((c) => [c.id, c]));
  // Preserve bookmark recency order rather than the DB's arbitrary order.
  return {
    ok: true,
    data: ids.map((id) => byId.get(id)).filter(Boolean) as ContentWithRelations[],
  };
}

export async function toggleBookmark(contentId: string): Promise<ApiResult<boolean>> {
  const userId = await actingUserId();
  if (!userId) return fail(401, "Sign in to bookmark stories");

  if (!hasSupabaseEnv()) {
    const { toggleBookmark: toggleMock } = await import("@/lib/data/publicMock");
    return { ok: true, data: toggleMock(userId, contentId) };
  }

  const supabase = createSupabaseServerClient();
  const { data: existing, error: readError } = await supabase
    .from("bookmarks")
    .select("id")
    .eq("user_id", userId)
    .eq("content_id", contentId)
    .maybeSingle();
  if (readError) return fail(statusForErrorCode(readError.code), readError.message);

  if (existing) {
    const { error } = await supabase.from("bookmarks").delete().eq("id", existing.id);
    if (error) return fail(statusForErrorCode(error.code), error.message);
    return { ok: true, data: false };
  }

  const { error } = await supabase
    .from("bookmarks")
    .insert({ user_id: userId, content_id: contentId });
  if (error) return fail(statusForErrorCode(error.code), error.message);
  return { ok: true, data: true };
}

// ── Newsletter ──────────────────────────────────────────────────────

export async function subscribeToNewsletter(
  email: string,
  locale: string,
): Promise<ApiResult<{ message: string }>> {
  if (!hasSupabaseEnv()) {
    const { subscribeNewsletter } = await import("@/lib/data/publicMock");
    const result = subscribeNewsletter(email, locale);
    return { ok: true, data: { message: result.message } };
  }

  const supabase = createSupabaseServerClient();
  // The live table has no `locale` column (0001), and an anonymous re-subscribe
  // needs an UPDATE the RLS policy cannot grant — so the upsert lives in the
  // `subscribe_newsletter` RPC (migration 0008).
  const { data, error } = await supabase.rpc("subscribe_newsletter", {
    p_email: email,
    p_locale: locale,
  });

  if (error) return fail(statusForErrorCode(error.code), error.message);
  const created = (data as { created?: boolean } | null)?.created ?? true;
  return { ok: true, data: { message: created ? "subscribed" : "already_subscribed" } };
}

// ── Polls ───────────────────────────────────────────────────────────

export async function listActivePolls(limit = 2): Promise<Poll[]> {
  const supabase = createSupabaseAnonClient();
  if (!supabase) {
    const { getActivePolls } = await import("@/lib/data/pollMock");
    return getActivePolls().slice(0, limit);
  }

  const { data, error } = await supabase
    .from("polls")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return (data as PollRow[])
    .map(mapPollRow)
    .filter((poll) => !poll.endsAt || new Date(poll.endsAt) > new Date())
    .slice(0, limit);
}

export async function castPollVote(
  pollId: string,
  optionId: string,
): Promise<ApiResult<Poll>> {
  if (!hasSupabaseEnv()) {
    const { votePoll } = await import("@/lib/data/pollMock");
    const poll = votePoll(pollId, optionId);
    return poll ? { ok: true, data: poll } : fail(404, "Poll or option not found");
  }

  const profile = await getAuthProfile();
  if (!profile) return fail(401, "Sign in to vote");

  const supabase = createSupabaseServerClient();
  // SECURITY DEFINER RPC (migration 0008): records the vote and updates the
  // publicly readable counters in `polls.options` in one transaction.
  const { data, error } = await supabase.rpc("cast_poll_vote", {
    p_poll_id: pollId,
    p_option_id: optionId,
  });
  if (error) return fail(statusForErrorCode(error.code), error.message);
  return { ok: true, data: mapPollRow(data as PollRow) };
}
