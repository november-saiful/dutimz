export const runtime = "edge";

import { NextRequest } from "next/server";
import { json, jsonError, hasSupabase } from "@/lib/data/deskApi";

/**
 * GET /api/admin/contents?search=&status=&type=&page=
 *   → paginated list of all content (admin only).
 * DELETE /api/admin/contents?id=...
 *   → delete any content (admin only).
 */

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const type = request.nextUrl.searchParams.get("type") ?? undefined;
  const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10);

  if (hasSupabase()) {
    const { requireAdmin } = await import("@/lib/auth/admin");
    const ctx = await requireAdmin();
    if (!ctx) return jsonError("Admin role required", 403);

    const pageSize = 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = ctx.supabase
      .from("contents")
      .select(
        "id, slug, title_bn, title_en, content_type, status, is_featured, is_breaking, view_count, published_at, created_at, category:categories(id, name_bn)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) {
      query = query.or(
        `title_bn.ilike.%${search}%,title_en.ilike.%${search}%,slug.ilike.%${search}%`,
      );
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (type) {
      query = query.eq("content_type", type);
    }

    const { data, error, count } = await query;
    if (error) return jsonError(error.message, 500);
    return json({ contents: data ?? [], total: count ?? 0 });
  }

  // Mock mode
  const { mockContents } = await import("@/lib/data/mock");
  let results = [...mockContents];

  if (search) {
    const q = search.toLowerCase();
    results = results.filter(
      (c) =>
        c.title_bn.toLowerCase().includes(q) ||
        (c.title_en ?? "").toLowerCase().includes(q) ||
        c.slug.includes(q),
    );
  }
  if (status) {
    results = results.filter((c) => c.status === status);
  }
  if (type) {
    results = results.filter((c) => c.content_type === type);
  }

  const total = results.length;
  const pageSize = 20;
  const start = (page - 1) * pageSize;
  const paged = results.slice(start, start + pageSize);

  return json({
    contents: paged.map((c) => ({
      id: c.id,
      slug: c.slug,
      title_bn: c.title_bn,
      title_en: c.title_en,
      content_type: c.content_type,
      status: c.status,
      is_featured: c.is_featured,
      is_breaking: c.is_breaking,
      view_count: c.view_count,
      published_at: c.published_at,
      created_at: c.created_at,
      category: c.category ? { id: c.category.id, name_bn: c.category.name_bn } : null,
    })),
    total,
  });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return jsonError("`id` is required");

  if (hasSupabase()) {
    const { requireAdmin } = await import("@/lib/auth/admin");
    const ctx = await requireAdmin();
    if (!ctx) return jsonError("Admin role required", 403);

    // Check content exists
    const { data: row } = await ctx.supabase
      .from("contents")
      .select("id, title_bn")
      .eq("id", id)
      .maybeSingle();
    if (!row) return jsonError("Content not found", 404);

    // Hard delete (admin privilege)
    const { error } = await ctx.supabase.from("contents").delete().eq("id", id);
    if (error) return jsonError(error.message, 500);
    return json({ deleted: true, title: row.title_bn });
  }

  return jsonError("Content deletion not available in mock mode", 400);
}
