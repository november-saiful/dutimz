export const runtime = "edge";

import { NextRequest } from "next/server";
import type { Content, ContentStatus } from "@/types";
import {
  MOCK_DESK_USER,
  getMockContent,
  getMockRevision,
  listMockRevisions,
  updateMockContent,
} from "@/lib/data/reporterMock";
import { hasSupabase, json, jsonError } from "@/lib/data/deskApi";
import {
  WorkflowTransitionError,
  applyTransition,
  type WorkflowAction,
} from "@/lib/content/workflow";
import {
  checkSlugUnique,
  saveContent,
  type SaveContentResult,
} from "@/lib/data/contentStore";
import type { RevisionAction } from "@/lib/content/revisions";
import {
  validateDraft,
  validateForPublish,
  type ContentDraftInput,
} from "@/lib/content/validate";

/**
 * /api/reporter/contents/[id]
 *  GET    → content row + its revision history (author or moderator+).
 *  PATCH  → two modes:
 *           - field updates: { fields: {...}, note? }
 *           - workflow transition: { action: "submit" | "approve" | ... , note? }
 *           Transitions re-run server-side validation and write a revision.
 *  DELETE → allowed for the author while unpublished (draft/rejected).
 */

interface PatchBody {
  fields?: Partial<Content>;
  action?: WorkflowAction;
  note?: string;
}

const ROLE_RANK = { visitor: 1, reporter: 2, moderator: 3, admin: 4 } as const;

async function resolveActor(): Promise<{
  id: string;
  name: string;
  role: "reporter" | "moderator" | "admin";
} | null> {
  if (!hasSupabase()) {
    // Mock mode acts as the seeded reporter; workflow role checks still run.
    return {
      id: MOCK_DESK_USER.id,
      name: MOCK_DESK_USER.display_name,
      role: MOCK_DESK_USER.role,
    };
  }
  const { getAuthProfile } = await import("@/lib/auth/server");
  const profile = await getAuthProfile();
  if (!profile || profile.role === "visitor") return null;
  return {
    id: profile.id,
    name: profile.display_name ?? profile.username,
    role: profile.role,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const actor = await resolveActor();
  if (!actor) return jsonError("Authentication required", 401);

  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = createSupabaseServerClient();
    const { data: content, error } = await supabase
      .from("contents")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) return jsonError(error.message, 500);
    if (!content) return jsonError("Not found", 404);

    const { data: revisions } = await supabase
      .from("content_revisions")
      .select("*, editor:profiles(id, username, display_name, avatar_url)")
      .eq("content_id", params.id)
      .order("version", { ascending: false });

    return json({ content, revisions: revisions ?? [] });
  }

  const content = getMockContent(params.id);
  if (!content) return jsonError("Not found", 404);
  return json({ content, revisions: listMockRevisions(params.id) });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const actor = await resolveActor();
  if (!actor) return jsonError("Authentication required", 401);

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return jsonError("Invalid JSON body");
  }

  if (!body.fields && !body.action) {
    return jsonError("Provide `fields` or `action`");
  }

  // ---- Load current row -------------------------------------------------
  let current: Content | null = null;
  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = createSupabaseServerClient();
    const { data } = await supabase
      .from("contents")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    current = (data as Content | null) ?? null;
  } else {
    current = getMockContent(params.id) ?? null;
  }
  if (!current) return jsonError("Not found", 404);

  const isOwner = current.author_id === actor.id;
  const isModerator = ROLE_RANK[actor.role] >= 3;
  if (!isOwner && !isModerator) {
    return jsonError("Not allowed to edit this story", 403);
  }

  // ---- Workflow transition ----------------------------------------------
  if (body.action) {
    try {
      const draftInput: ContentDraftInput = {
        title_bn: current.title_bn,
        body_bn: current.body_bn,
        content_type: current.content_type,
        content_format: current.content_format,
        thumbnail_url: current.thumbnail_url,
        video_url: current.video_url,
      };
      const goesLive = ["approve", "publish"].includes(body.action);
      const issues = goesLive
        ? validateForPublish(draftInput)
        : validateDraft(draftInput);
      if (issues.length > 0) {
        return jsonError(issues[0]?.message_en ?? "Validation failed", 422, { issues });
      }

      // Guards the transition (state + role) and tells us where it lands. The
      // revision's version number is allocated by the store, which is also the
      // authority when a save races this one.
      const result = applyTransition(
        current.status as ContentStatus,
        body.action,
        actor,
        current.version,
      );

      const patch: Partial<Content> = {
        status: result.status,
        published_at: result.publishedAt ?? current.published_at,
      };
      const saved = await save(params.id, patch, actor, {
        note: body.note,
        action: body.action,
      });
      if (!saved.ok) return jsonError(saved.error, saved.status);
      return json({ content: saved.content });
    } catch (err) {
      if (err instanceof WorkflowTransitionError) {
        return jsonError(err.message, 409, {
          reason: err.reason,
          from: err.from,
          action: err.action,
        });
      }
      return jsonError("Transition failed", 500);
    }
  }

  // ---- Field update -------------------------------------------------------
  const fields = body.fields ?? {};
  const allowed = [
    "title_bn",
    "subtitle_bn",
    "excerpt_bn",
    "body_bn",
    "title_en",
    "subtitle_en",
    "excerpt_en",
    "body_en",
    "thumbnail_url",
    "thumbnail_alt",
    "video_url",
    "category_id",
    "tags",
    "content_type",
    "is_breaking",
    "meta_title",
    "meta_description",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in fields) patch[key] = fields[key as keyof Content];
  }
  // Handle custom slug update (not a Content field, sent separately).
  const rawBody = fields as unknown as Record<string, unknown>;
  if (rawBody.custom_slug !== undefined) {
    const customSlug = typeof rawBody.custom_slug === "string" ? (rawBody.custom_slug as string).trim() : "";
    if (!customSlug) {
      return jsonError("Slug cannot be empty");
    }
    if (customSlug.length < 2) {
      return jsonError("Slug must be at least 2 characters");
    }
    patch.slug = customSlug.replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  }
  if (Object.keys(patch).length === 0) {
    return jsonError("No editable fields provided");
  }

  // Slug uniqueness: reject when another story already uses this slug.
  if (typeof patch.slug === "string" && patch.slug !== current.slug) {
    if (hasSupabase()) {
      const { createSupabaseServerClient } = await import("@/lib/supabase/server");
      const supabase = createSupabaseServerClient();
      const unique = await checkSlugUnique(supabase, patch.slug as string, params.id);
      if (!unique) {
        return jsonError("This slug is already in use by another story.", 409);
      }
    }
  }

  // Guards: editing a published story without moderator rights → back to review.
  let statusPatch: Partial<Content> = {};
  if (current.status === "published" && !isModerator) {
    statusPatch = { status: "pending_review" };
  }

  const draftInput: ContentDraftInput = {
    title_bn: (patch.title_bn as string) ?? current.title_bn,
    body_bn: (patch.body_bn as string | null) ?? current.body_bn,
    content_type: (patch.content_type as Content["content_type"]) ?? current.content_type,
    content_format: current.content_format,
    thumbnail_url: (patch.thumbnail_url as string | null) ?? current.thumbnail_url,
    video_url: (patch.video_url as string | null) ?? current.video_url,
  };
  const issues = validateDraft({ ...draftInput, content_type: draftInput.content_type });
  if (issues.length > 0) {
    return jsonError(issues[0]?.message_en ?? "Validation failed", 422, { issues });
  }

  const saved = await save(
    params.id,
    { ...patch, ...statusPatch } as Partial<Content>,
    actor,
    { note: body.note, action: "edit" },
  );
  if (!saved.ok) return jsonError(saved.error, saved.status);
  return json({ content: saved.content });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const actor = await resolveActor();
  if (!actor) return jsonError("Authentication required", 401);

  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const { getAuthProfile } = await import("@/lib/auth/server");
    const profile = await getAuthProfile();
    if (!profile) return jsonError("Authentication required", 401);

    const supabase = createSupabaseServerClient();
    const { data: row } = await supabase
      .from("contents")
      .select("author_id, status")
      .eq("id", params.id)
      .maybeSingle();
    if (!row) return jsonError("Not found", 404);
    const isModerator = ROLE_RANK[profile.role] >= 3;
    if (row.author_id !== profile.id && !isModerator) {
      return jsonError("Not allowed", 403);
    }
    if (!["draft", "rejected"].includes(row.status) && !isModerator) {
      return jsonError("Only unpublished drafts can be deleted", 409);
    }

    const { error } = await supabase
      .from("contents")
      .delete()
      .eq("id", params.id);
    if (error) return jsonError(error.message, 500);
    return json({ deleted: true });
  }

  // Mock mode.
  const row = getMockContent(params.id);
  if (!row) return jsonError("Not found", 404);
  const isModerator = ROLE_RANK[actor.role] >= 3;
  if (row.author_id !== actor.id && !isModerator) return jsonError("Not allowed", 403);
  if (!["draft", "rejected"].includes(row.status) && !isModerator) {
    return jsonError("Only unpublished drafts can be deleted", 409);
  }
  mockDelete(params.id);
  return json({ deleted: true });
}

// ---------------------------------------------------------------------------
// Persistence helper — Supabase store vs mock store behind one call.
// ---------------------------------------------------------------------------

/**
 * Save a story + its revision. Both stores apply the same rules (one revision
 * per change, one version number per revision — see `saveContent`).
 */
async function save(
  id: string,
  patch: Partial<Content>,
  actor: { id: string; name: string; role: "reporter" | "moderator" | "admin" },
  meta: { note?: string; action: RevisionAction },
): Promise<SaveContentResult> {
  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    return saveContent(createSupabaseServerClient(), {
      contentId: id,
      patch,
      editorId: actor.id,
      action: meta.action,
      note: meta.note,
    });
  }

  const saved = updateMockContent(id, patch, {
    editorName: actor.name,
    note: meta.note,
    action: meta.action,
  });
  if (!saved) return { ok: false, status: 404, error: "Not found" };
  return { ok: true, content: saved, version: saved.version, recorded: true };
}

function mockDelete(id: string): void {
  // The in-memory mock store keeps history intact: deletion archives the row.
  updateMockContent(id, { status: "archived" } as Partial<Content>, { action: "delete" });
}
