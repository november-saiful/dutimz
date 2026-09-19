import type { SupabaseClient } from "@supabase/supabase-js";
import type { Content } from "@/types";
import {
  buildRevisionChanges,
  nextRevisionVersion,
  shouldRecordRevision,
  type RevisionAction,
} from "@/lib/content/revisions";

/**
 * The one place that writes a story and its revision together (Supabase mode).
 *
 * Both desks used to do this by hand — the reporter editor in
 * `/api/reporter/contents/[id]` and the moderation queue in
 * `/api/moderator/queue` — and they had drifted: the queue recorded a
 * `status` diff while the editor's own publish recorded an empty one, and both
 * computed the next version as `contents.version + 1` from a row they had read
 * earlier in the request. Two saves racing on the same story could therefore
 * claim the same version number twice, because nothing in the schema said the
 * pair had to be unique.
 *
 * The rules enforced here:
 *  - every recorded revision gets its own version number (`nextRevisionVersion`);
 *  - the revision row is inserted **first**, so the unique index
 *    `(content_id, version)` is what guards the number — a racing save loses
 *    the insert and is retried with a freshly computed version, instead of
 *    silently sharing a number with the winner;
 *  - a field save that changed nothing writes no revision and does not bump.
 */

export interface SaveContentInput {
  contentId: string;
  /** Columns to write, already whitelisted by the caller. */
  patch: Partial<Content>;
  editorId: string;
  action: RevisionAction;
  note?: string;
  /** Wrap every save in its own attempt when the version is already taken. */
  maxAttempts?: number;
}

export type SaveContentResult =
  | { ok: true; content: Content; version: number; recorded: boolean }
  | { ok: false; status: number; error: string };

/** Postgres unique-violation, i.e. "that version number is already taken". */
const UNIQUE_VIOLATION = "23505";

const DEFAULT_ATTEMPTS = 3;

/**
 * Save `patch`, recording a revision when it deserves one.
 *
 * `published_at` is the caller's business (it comes from the workflow
 * transition), so it travels inside `patch`.
 */
export async function saveContent(
  supabase: SupabaseClient,
  input: SaveContentInput,
): Promise<SaveContentResult> {
  const attempts = input.maxAttempts ?? DEFAULT_ATTEMPTS;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { data: beforeRows, error: readError } = await supabase
      .from("contents")
      .select("*")
      .eq("id", input.contentId)
      .maybeSingle();
    if (readError) return { ok: false, status: 500, error: readError.message };

    const before = (beforeRows as Content | null) ?? null;
    if (!before) return { ok: false, status: 404, error: "Not found" };

    const changes = buildRevisionChanges(before, { ...before, ...input.patch }, {
      action: input.action,
      note: input.note,
    });

    // Nothing moved: don't invent a version for it.
    if (!shouldRecordRevision(input.action, changes.diff)) {
      return { ok: true, content: before, version: before.version, recorded: false };
    }

    const version = nextRevisionVersion(
      before.version,
      await latestRevisionVersion(supabase, input.contentId),
    );

    const { error: revisionError } = await supabase
      .from("content_revisions")
      .insert({
        content_id: input.contentId,
        editor_id: input.editorId,
        version,
        changes,
      });

    if (revisionError) {
      if (revisionError.code === UNIQUE_VIOLATION) {
        // Someone else took that number between our read and our insert: read
        // again (including their revision) and redo the whole save.
        if (attempt < attempts) continue;
        // Out of attempts — fall through to the conflict answer rather than
        // reporting the raw duplicate-key error as a server fault.
        break;
      }
      return { ok: false, status: 500, error: revisionError.message };
    }

    const { data, error } = await supabase
      .from("contents")
      .update({
        ...input.patch,
        version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.contentId)
      .select("*")
      .single();

    if (error) {
      // The revision row is already written, which is the safer half: the
      // history is complete and the next save picks a number above it.
      return { ok: false, status: 500, error: error.message };
    }

    return { ok: true, content: data as Content, version, recorded: true };
  }

  return {
    ok: false,
    status: 409,
    error: "This story is being edited elsewhere. Reload and try again.",
  };
}

/**
 * Check whether a slug is already taken by another content row.
 * Returns `true` when the slug is available (unique).
 */
export async function checkSlugUnique(
  supabase: SupabaseClient,
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  let query = supabase
    .from("contents")
    .select("id", { count: "exact", head: true })
    .eq("slug", slug)
    .neq("status", "archived");
  if (excludeId) {
    query = query.neq("id", excludeId);
  }
  const { count } = await query;
  return (count ?? 0) === 0;
}

/** Highest version already stored for a story (null when it has no history). */
export async function latestRevisionVersion(
  supabase: SupabaseClient,
  contentId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("content_revisions")
    .select("version")
    .eq("content_id", contentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { version: number } | null)?.version ?? null;
}
