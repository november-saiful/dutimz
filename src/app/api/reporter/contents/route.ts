import { NextRequest } from "next/server";
import type { Content, ContentType } from "@/types";
import {
  MOCK_DESK_USER,
  createMockContent,
  listMockContents,
} from "@/lib/data/reporterMock";
import { hasSupabase, json, jsonError } from "@/lib/data/deskApi";
import { buildSlug } from "@/lib/content/validate";
import { validateDraft } from "@/lib/content/validate";
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

  const slugBase = buildSlug(body.title_en ?? null, title);

  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const { getAuthProfile } = await import("@/lib/auth/server");
    const profile = await getAuthProfile();
    if (!profile) return jsonError("Authentication required", 401);
    if (profile.role === "visitor") return jsonError("Reporter role required", 403);

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("contents")
      .insert({
        slug: `${slugBase}-${Date.now().toString(36)}`,
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

    const { data: revision } = await supabase
      .from("content_revisions")
      .insert({
        content_id: createdRow.id,
        editor_id: profile.id,
        version: 1,
        changes: {
          diff: { title_bn: { from: null, to: title } },
          snapshot: { fields: { title_bn: title, body_bn: body.body_bn ?? null }, savedAt: new Date().toISOString() },
          action: "create",
          note: status === "pending_review" ? "সরাসরি জমা" : undefined,
        },
      });
    void revision;

    return json({ content: createdRow }, { status: 201 });
  }

  // Mock mode.
  const created = createMockContent({
    slug: slugify(`${slugBase}-${Date.now().toString(36)}`) || `mock-${Date.now().toString(36)}`,
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
