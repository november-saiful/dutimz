export const runtime = "edge";

import { NextRequest } from "next/server";
import type { Content } from "@/types";
import { hasSupabase, json, jsonError } from "@/lib/data/deskApi";
import {
  WorkflowTransitionError,
  applyTransition,
  type WorkflowAction,
} from "@/lib/content/workflow";
import {
  MOCK_MODERATOR,
  getMockContent,
  updateMockContent,
} from "@/lib/data/reporterMock";
import { saveContent } from "@/lib/data/contentStore";
import { validateForPublish, type ContentDraftInput } from "@/lib/content/validate";

/**
 * /api/moderator/queue
 *  GET  → stories awaiting review (pending_review) for the moderation desk.
 *  POST → { id, action, note? } — approve / reject / request_changes /
 *         publish / unpublish / archive straight from the queue.
 */

const QUEUE_STATUSES = ["pending_review", "rejected", "published"] as const;

export async function GET() {
  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const { getAuthProfile } = await import("@/lib/auth/server");
    const profile = await getAuthProfile();
    if (!profile || !["moderator", "admin"].includes(profile.role)) {
      return jsonError("Moderator role required", 403);
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("contents")
      .select("*, author:profiles(id, username, display_name, avatar_url)")
      .in("status", [...QUEUE_STATUSES])
      .order("updated_at", { ascending: true });
    if (error) return jsonError(error.message, 500);
    return json({ contents: (data ?? []) as Content[] });
  }

  // Mock mode: every pending/rejected story from the desk store.
  const { listMockContents } = await import("@/lib/data/reporterMock");
  const contents = listMockContents().filter((c) =>
    (QUEUE_STATUSES as readonly string[]).includes(c.status),
  );
  return json({ contents });
}

interface ActionBody {
  id?: string;
  action?: WorkflowAction;
  note?: string;
}

export async function POST(request: NextRequest) {
  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return jsonError("Invalid JSON body");
  }
  if (!body.id || !body.action) {
    return jsonError("`id` and `action` are required");
  }

  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const { getAuthProfile } = await import("@/lib/auth/server");
    const profile = await getAuthProfile();
    if (!profile || !["moderator", "admin"].includes(profile.role)) {
      return jsonError("Moderator role required", 403);
    }
    const actor = {
      id: profile.id,
      name: profile.display_name ?? profile.username,
      role: profile.role,
    };

    const supabase = createSupabaseServerClient();
    const { data: currentRows } = await supabase
      .from("contents")
      .select("*")
      .eq("id", body.id)
      .maybeSingle();
    const current = (currentRows as Content | null) ?? null;
    if (!current) return jsonError("Not found", 404);

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
      if (goesLive) {
        const issues = validateForPublish(draftInput);
        if (issues.length > 0) {
          return jsonError(issues[0]?.message_en ?? "Validation failed", 422, { issues });
        }
      }

      // `applyTransition` is the state/role guard; the store allocates the
      // revision's version number, exactly as the reporter editor does, so a
      // publish from this desk and one from the editor number identically.
      const result = applyTransition(current.status, body.action, actor, current.version);
      const saved = await saveContent(supabase, {
        contentId: body.id,
        patch: {
          status: result.status,
          published_at: result.publishedAt ?? current.published_at,
        },
        editorId: actor.id,
        action: body.action,
        note: body.note,
      });
      if (!saved.ok) return jsonError(saved.error, saved.status);

      return json({ content: saved.content });
    } catch (err) {
      if (err instanceof WorkflowTransitionError) {
        return jsonError(err.message, 409, { reason: err.reason });
      }
      return jsonError("Transition failed", 500);
    }
  }

  // Mock mode.
  const current = getMockContent(body.id);
  if (!current) return jsonError("Not found", 404);
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
    if (goesLive) {
      const issues = validateForPublish(draftInput);
      if (issues.length > 0) {
        return jsonError(issues[0]?.message_en ?? "Validation failed", 422, { issues });
      }
    }

    const result = applyTransition(current.status, body.action, MOCK_MOD_ACTOR, current.version);
    const saved = updateMockContent(
      body.id,
      {
        status: result.status,
        published_at: result.publishedAt ?? current.published_at,
      },
      {
        editorName: MOCK_MODERATOR.display_name,
        note: body.note,
        action: body.action,
      },
    );
    if (!saved) return jsonError("Not found", 404);
    return json({ content: saved });
  } catch (err) {
    if (err instanceof WorkflowTransitionError) {
      return jsonError(err.message, 409, { reason: err.reason });
    }
    return jsonError("Transition failed", 500);
  }
}

const MOCK_MOD_ACTOR = { id: "u-moderator", name: "নমুনা সম্পাদক", role: "moderator" as const };
