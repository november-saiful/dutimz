/**
 * Row → domain mappers for the public APIs.
 *
 * The live database (migration 0001, which 0006's `CREATE TABLE IF NOT
 * EXISTS` could not alter) differs from the app's TypeScript types in a few
 * ways this module absorbs:
 *
 *  - `polls` has one `question` column, plus the `question_bn` / `question_en`
 *    added in 0008, and no `total_votes` column (votes live inside the
 *    `options` JSONB and are summed here).
 *  - `comments` has no `depth` and no `author_avatar` column — depth is derived
 *    from the parent chain and the avatar comes from the joined profile.
 *
 * Keeping these pure means they can be unit tested without a database.
 */
import type { Comment } from "@/types";
import type { Poll, PollOption } from "@/components/content/PollWidget";

/** Maximum nesting depth the comment UI renders. */
export const MAX_COMMENT_DEPTH = 3;

const COMMENT_STATUSES: readonly Comment["status"][] = [
  "approved",
  "pending",
  "rejected",
  "spam",
];

// ── Polls ───────────────────────────────────────────────────────────

export interface PollRow {
  id: string;
  question?: string | null;
  question_bn?: string | null;
  question_en?: string | null;
  options?: unknown;
  is_active?: boolean | null;
  ends_at?: string | null;
  created_at?: string | null;
}

/**
 * Normalize the `options` JSONB. PostgREST hands back real JSON, but a mock or
 * a legacy row may hold a stringified array, and hand-written rows may miss
 * `votes` — so every entry is validated rather than trusted.
 */
export function parsePollOptions(raw: unknown): PollOption[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const option = entry as Record<string, unknown>;
    const id = typeof option.id === "string" && option.id ? option.id : `opt-${index}`;
    const label_bn = typeof option.label_bn === "string" ? option.label_bn : "";
    const label_en = typeof option.label_en === "string" ? option.label_en : "";
    const votes = Number(option.votes);
    return [
      {
        id,
        label_bn,
        label_en,
        votes: Number.isFinite(votes) && votes > 0 ? Math.floor(votes) : 0,
      },
    ];
  });
}

export function mapPollRow(row: PollRow): Poll {
  const options = parsePollOptions(row.options);
  const question = row.question ?? "";
  return {
    id: row.id,
    question_bn: row.question_bn ?? question,
    question_en: row.question_en ?? question,
    options,
    totalVotes: options.reduce((sum, option) => sum + option.votes, 0),
    endsAt: row.ends_at ?? undefined,
  };
}

// ── Comments ────────────────────────────────────────────────────────

export interface CommentRow {
  id: string;
  content_id: string;
  parent_id?: string | null;
  author_id?: string | null;
  author_name?: string | null;
  body?: string | null;
  status?: string | null;
  likes?: number | null;
  dislikes?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  author?: {
    id?: string | null;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

function commentDepth(
  id: string,
  parents: Map<string, string | null>,
): number {
  let depth = 0;
  let cursor = parents.get(id) ?? null;
  // Walk up to the root; the visited guard tolerates corrupt cycles.
  const seen = new Set<string>([id]);
  while (cursor && !seen.has(cursor) && depth < MAX_COMMENT_DEPTH) {
    seen.add(cursor);
    depth += 1;
    cursor = parents.get(cursor) ?? null;
  }
  return depth;
}

export function mapCommentRows(rows: CommentRow[]): Comment[] {
  const parents = new Map<string, string | null>();
  for (const row of rows) {
    parents.set(row.id, row.parent_id ?? null);
  }

  return rows.map((row) => {
    const status = COMMENT_STATUSES.includes(row.status as Comment["status"])
      ? (row.status as Comment["status"])
      : "approved";
    const now = new Date().toISOString();
    return {
      id: row.id,
      content_id: row.content_id,
      parent_id: row.parent_id ?? null,
      author_id: row.author_id ?? null,
      author_name:
        row.author_name ?? row.author?.display_name ?? row.author?.username ?? null,
      author_avatar: row.author?.avatar_url ?? null,
      body: row.body ?? "",
      status,
      likes: row.likes ?? 0,
      dislikes: row.dislikes ?? 0,
      depth: commentDepth(row.id, parents),
      created_at: row.created_at ?? now,
      updated_at: row.updated_at ?? now,
    };
  });
}

/** Same mapping for a single row (create / react responses). */
export function mapCommentRow(row: CommentRow): Comment {
  return mapCommentRows([row])[0]!;
}
