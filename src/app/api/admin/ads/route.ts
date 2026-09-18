export const runtime = "edge";

import { NextRequest } from "next/server";
import { json, jsonError, hasSupabase } from "@/lib/data/deskApi";
import { listAds, createAd, updateAd, deleteAd } from "@/lib/data/adminMock";

/**
 * GET    /api/admin/ads — list all ads.
 * POST   /api/admin/ads — create a new ad.
 * PATCH  /api/admin/ads — update an ad by { id, ...patch }.
 * DELETE /api/admin/ads?id=... — delete an ad.
 */

export async function GET() {
  if (hasSupabase()) {
    const { requireAdmin } = await import("@/lib/auth/admin");
    const ctx = await requireAdmin();
    if (!ctx) return jsonError("Admin role required", 403);

    const { data, error } = await ctx.supabase
      .from("ads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return jsonError(error.message, 500);
    return json({ ads: data ?? [] });
  }

  return json({ ads: listAds() });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  if (!body.name || !body.placement) {
    return jsonError("`name` and `placement` are required");
  }

  if (hasSupabase()) {
    const { requireAdmin } = await import("@/lib/auth/admin");
    const ctx = await requireAdmin();
    if (!ctx) return jsonError("Admin role required", 403);

    const { data, error } = await ctx.supabase
      .from("ads")
      .insert({
        name: body.name,
        placement: body.placement,
        image_url: body.image_url ?? null,
        link_url: body.link_url ?? null,
        html_content: body.html_content ?? null,
        start_date: body.start_date ?? null,
        end_date: body.end_date ?? null,
        is_active: body.is_active ?? true,
      })
      .select("*")
      .single();
    if (error) return jsonError(error.message, 500);
    return json({ ad: data }, { status: 201 });
  }

  const ad = createAd({
    name: body.name as string,
    placement: body.placement as string,
    image_url: (body.image_url as string) ?? null,
    link_url: (body.link_url as string) ?? null,
    html_content: (body.html_content as string) ?? null,
    start_date: (body.start_date as string) ?? null,
    end_date: (body.end_date as string) ?? null,
    is_active: (body.is_active as boolean) ?? true,
  });
  return json({ ad }, { status: 201 });
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
    const { requireAdmin } = await import("@/lib/auth/admin");
    const ctx = await requireAdmin();
    if (!ctx) return jsonError("Admin role required", 403);

    const { id, ...patch } = body;
    const { data, error } = await ctx.supabase.from("ads").update(patch).eq("id", id).select("*").single();
    if (error) return jsonError(error.message, 500);
    return json({ ad: data });
  }

  const { id, ...patch } = body;
  const updated = updateAd(id, patch as Parameters<typeof updateAd>[1]);
  if (!updated) return jsonError("Ad not found", 404);
  return json({ ad: updated });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return jsonError("`id` query param is required");

  if (hasSupabase()) {
    const { requireAdmin } = await import("@/lib/auth/admin");
    const ctx = await requireAdmin();
    if (!ctx) return jsonError("Admin role required", 403);

    const { error } = await ctx.supabase.from("ads").delete().eq("id", id);
    if (error) return jsonError(error.message, 500);
    return json({ deleted: true });
  }

  const ok = deleteAd(id);
  if (!ok) return jsonError("Ad not found", 404);
  return json({ deleted: true });
}
