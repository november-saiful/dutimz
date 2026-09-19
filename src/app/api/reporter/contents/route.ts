export const runtime = "edge";

import { NextRequest } from "next/server";
import type { Content, ContentType } from "@/types";
import {
  MOCK_DESK_USER,
  createMockContent,
  listMockContents,
} from "@/lib/data/reporterMock";
import { hasSupabase, json, jsonError } from "@/lib/data/deskApi";
import { buildSlug, validateDraft } from "@/lib/content/validate";
import { checkSlugUnique } from "@/lib/data/contentStore";
import { buildSnapshot } from "@/lib/content/revisions";
import { slugify } from "@/lib/utils/format";

/**
 * /api/reporter/contents
 *  GET  → the reporter's own stories (all statuses) for the dashboard.
 *  POST → create a new draft (or direct-submit when `submit: true`).
 *
 * Supabase mode: RLS restricts every query to the signed-in author.
 * Mock mode: the in-memory desk store backs the same contract.
 */

export async function GET() {
  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const { getAuthProfile } = await import("@/lib/auth/server");
    const profile = await getAuthProfile();
    if (!profile) return jsonError("Authentication required", 401);

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("contents")
      .select("*")
      .eq("author_id", profile.id)
      .order("updated_at", { ascending: false });
    if (error) return jsonError(error.message, 500);
    return json({ contents: (data ?? []) as Content[] });
  }

  // Mock mode: the desk user "owns" every seeded row.
  return json({ contents: listMockContents() });
}

interface CreateBody {
  title_bn?: string;
  title_en?: string | null;
  body_bn?: string | null;
  content_type?: ContentType;
  category_id?: string | null;
  tags?: string[];
  submit?: boolean;
  custom_slug?: string;
}

export async function POST(request: NextRequest) {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return jsonError("Invalid JSON body");
  }

  const title = (body.title_bn ?? "").trim();
  if (title.length < 2) {
    return jsonError("Title is required (minimum 2 characters)");
  }

  const customSlug = (body.custom_slug ?? "").trim();
  if (!customSlug) {
    return jsonError("Slug is required");
  }
  if (customSlug.length < 2) {
    return jsonError("Slug must be at least 2 characters");
  }

  const contentType: ContentType = body.content_type ?? "news";
  const status = body.submit ? "pending_review" : "draft";

  const draftInput = {
    title_bn: title,
    body_bn: body.body_bn ?? null,
    content_type: contentType,
    content_format: contentType === "documentary" ? ("video" as const) : ("text" as const),
  };
  const issues = validateDraft(draftInput);
  if (issues.length > 0 && body.submit) {
    return jsonError(issues[0]?.message_en ?? "Validation failed", 422, { issues });
  }

  const isCustomSlug = Boolean(body.custom_slug?.trim());
  const slugBase = isCustomSlug
    ? body.custom_slug!.trim().replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "")
    : buildSlug(body.title_en ?? null, title);
  // Custom slugs are used as-is; auto-generated slugs get a timestamp suffix
  // to avoid collisions between near-simultaneous creates.
  const slug = isCustomSlug ? slugBase : `${slugBase}-${Date.now().toString(36)}`;

  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const { getAuthProfile } = await import("@/lib/auth/server");
    const profile = await getAuthProfile();
    if (!profile) return jsonError("Authentication required", 401);
    if (profile.role === "visitor") return jsonError("Reporter role required", 403);

    const supabase = createSupabaseServerClient();

    // Reject duplicate slug before insert.
    if (isCustomSlug) {
      const unique = await checkSlugUnique(supabase, slug);
      if (!unique) {
        return jsonError("This slug is already in use by another story.", 409);
      }
    }

    const { data, error } = await supabase
      .from("contents")
      .insert({
        slug,
        content_type: contentType,
        content_format: contentType === "documentary" ? "video" : "text",
        title_bn: title,
        title_en: body.title_en ?? null,
        body_bn: body.body_bn ?? null,
        category_id: body.category_id ?? null,
        tags: body.tags ?? [],
        author_id: profile.id,
        created_by: profile.id,
        updated_by: profile.id,
        status,
      })
      .select("*")
      .single();
    if (error) return jsonError(error.message, 500);
    const createdRow = data as Content;

    // A new story opens the history at version 1. The snapshot is the full
    // tracked-field set (restoring v1 must not come back half-empty); the diff
    // stays title-only because that is what actually created the story.
    await supabase.from("content_revisions").insert({
      content_id: createdRow.id,
      editor_id: profile.id,
      version: 1,
      changes: {
        diff: { title_bn: { from: null, to: title } },
        snapshot: buildSnapshot(createdRow),
        action: "create",
        note: status === "pending_review" ? "সরাসরি জমা" : undefined,
      },
    });

    return json({ content: createdRow }, { status: 201 });
  }

  // Mock mode.
  const created = createMockContent({
    slug: isCustomSlug ? slugify(slugBase) : (slugify(`${slugBase}-${Date.now().toString(36)}`) || `mock-${Date.now().toString(36)}`),
    title_bn: title,
    title_en: body.title_en ?? null,
    body_bn: body.body_bn ?? null,
    content_type: contentType,
    content_format: contentType === "documentary" ? "video" : "text",
    category_id: body.category_id ?? null,
    tags: body.tags ?? [],
    status,
  });
  void MOCK_DESK_USER;
  return json({ content: created }, { status: 201 });
}
