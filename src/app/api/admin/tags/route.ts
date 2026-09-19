export const runtime = "edge";

import { NextRequest } from "next/server";
import { json, jsonError, hasSupabase } from "@/lib/data/deskApi";
import { postgrestIlikePattern } from "@/lib/content/search";
import { listTags, createTag, updateTag, deleteTag } from "@/lib/data/adminMock";

/**
 * GET    /api/admin/tags?search= — list tags.
 * POST   /api/admin/tags — create a new tag.
 * PATCH  /api/admin/tags — update a tag by { id, ...patch }.
 * DELETE /api/admin/tags?id=... — delete a tag.
 */

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") ?? undefined;

  if (hasSupabase()) {
    const { requireModerator } = await import("@/lib/auth/admin");
    const ctx = await requireModerator();
    if (!ctx) return jsonError("Moderator+ role required", 403);

    let query = ctx.supabase.from("tags").select("*").order("usage_count", { ascending: false });
    if (search) {
      const pattern = postgrestIlikePattern(search);
      query = query.or(
        `name_bn.ilike.${pattern},name_en.ilike.${pattern},slug.ilike.${pattern}`,
      );
    }
    const { data, error } = await query;
    if (error) return jsonError(error.message, 500);
    return json({ tags: data ?? [] });
  }

  return json({ tags: listTags(search) });
}

export async function POST(request: NextRequest) {
  let body: { name_bn?: string; name_en?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  if (!body.name_bn || !body.name_en || !body.slug) {
    return jsonError("`name_bn`, `name_en`, and `slug` are required");
  }

  if (hasSupabase()) {
    const { requireModerator } = await import("@/lib/auth/admin");
    const ctx = await requireModerator();
    if (!ctx) return jsonError("Moderator+ role required", 403);

    const { data, error } = await ctx.supabase
      .from("tags")
      .insert({ name_bn: body.name_bn, name_en: body.name_en, slug: body.slug })
      .select("*")
      .single();
    if (error) return jsonError(error.message, 500);
    return json({ tag: data }, { status: 201 });
  }

  const tag = createTag({ name_bn: body.name_bn, name_en: body.name_en, slug: body.slug });
  return json({ tag }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  let body: { id?: string; [key: string]: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  if (!body.id) return jsonError("`id` is required");

  if (hasSupabase()) {
    const { requireModerator } = await import("@/lib/auth/admin");
    const ctx = await requireModerator();
    if (!ctx) return jsonError("Moderator+ role required", 403);

    const { id, ...patch } = body;
    const { data, error } = await ctx.supabase.from("tags").update(patch).eq("id", id).select("*").single();
    if (error) return jsonError(error.message, 500);
    return json({ tag: data });
  }

  const { id, ...patch } = body;
  const updated = updateTag(id, patch as Parameters<typeof updateTag>[1]);
  if (!updated) return jsonError("Tag not found", 404);
  return json({ tag: updated });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return jsonError("`id` query param is required");

  if (hasSupabase()) {
    const { requireModerator } = await import("@/lib/auth/admin");
    const ctx = await requireModerator();
    if (!ctx) return jsonError("Moderator+ role required", 403);

    const { error } = await ctx.supabase.from("tags").delete().eq("id", id);
    if (error) return jsonError(error.message, 500);
    return json({ deleted: true });
  }

  const ok = deleteTag(id);
  if (!ok) return jsonError("Tag not found", 404);
  return json({ deleted: true });
}
