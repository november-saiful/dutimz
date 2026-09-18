export const runtime = "edge";

import { NextRequest } from "next/server";
import { json, jsonError, hasSupabase } from "@/lib/data/deskApi";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/data/adminMock";

/**
 * GET    /api/admin/categories — list all categories (including inactive).
 * POST   /api/admin/categories — create a new category.
 * PATCH  /api/admin/categories — update a category by { id, ...patch }.
 * DELETE /api/admin/categories?id=... — delete a category.
 */

export async function GET() {
  if (hasSupabase()) {
    const { requireModerator } = await import("@/lib/auth/admin");
    const ctx = await requireModerator();
    if (!ctx) return jsonError("Moderator+ role required", 403);

    const { data, error } = await ctx.supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) return jsonError(error.message, 500);
    return json({ categories: data ?? [] });
  }

  return json({ categories: listCategories() });
}

export async function POST(request: NextRequest) {
  let body: { name_bn?: string; name_en?: string; slug?: string; description?: string; parent_id?: string | null; sort_order?: number; is_active?: boolean };
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
      .from("categories")
      .insert({
        name_bn: body.name_bn,
        name_en: body.name_en,
        slug: body.slug,
        description: body.description ?? null,
        parent_id: body.parent_id ?? null,
        sort_order: body.sort_order ?? 0,
        is_active: body.is_active ?? true,
      })
      .select("*")
      .single();
    if (error) return jsonError(error.message, 500);
    return json({ category: data }, { status: 201 });
  }

  const cat = createCategory({
    name_bn: body.name_bn,
    name_en: body.name_en,
    slug: body.slug,
    description: body.description ?? null,
    parent_id: body.parent_id ?? null,
    sort_order: body.sort_order ?? 0,
    is_active: body.is_active ?? true,
  });
  return json({ category: cat }, { status: 201 });
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
    const { data, error } = await ctx.supabase
      .from("categories")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return jsonError(error.message, 500);
    return json({ category: data });
  }

  const { id, ...patch } = body;
  const updated = updateCategory(id, patch as Parameters<typeof updateCategory>[1]);
  if (!updated) return jsonError("Category not found", 404);
  return json({ category: updated });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return jsonError("`id` query param is required");

  if (hasSupabase()) {
    const { requireModerator } = await import("@/lib/auth/admin");
    const ctx = await requireModerator();
    if (!ctx) return jsonError("Moderator+ role required", 403);

    const { error } = await ctx.supabase.from("categories").delete().eq("id", id);
    if (error) return jsonError(error.message, 500);
    return json({ deleted: true });
  }

  const ok = deleteCategory(id);
  if (!ok) return jsonError("Category not found", 404);
  return json({ deleted: true });
}
