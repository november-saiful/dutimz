export const runtime = "edge";

import { NextRequest } from "next/server";
import { json, jsonError, hasSupabase } from "@/lib/data/deskApi";
import { reorderCategories } from "@/lib/data/adminMock";

/**
 * PATCH /api/admin/categories/reorder — { orderedIds: string[] }
 */

export async function PATCH(request: NextRequest) {
  let body: { orderedIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  if (!body.orderedIds || !Array.isArray(body.orderedIds)) {
    return jsonError("`orderedIds` array is required");
  }

  if (hasSupabase()) {
    const { requireModerator } = await import("@/lib/auth/admin");
    const ctx = await requireModerator();
    if (!ctx) return jsonError("Moderator+ role required", 403);

    const updates = body.orderedIds.map((id, index) =>
      ctx.supabase
        .from("categories")
        .update({ sort_order: index + 1 })
        .eq("id", id),
    );
    const results = await Promise.all(updates);
    const error = results.find((r) => r.error);
    if (error) return jsonError(error.error!.message, 500);

    const { data, error: fetchErr } = await ctx.supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });
    if (fetchErr) return jsonError(fetchErr.message, 500);
    return json({ categories: data ?? [] });
  }

  const categories = reorderCategories(body.orderedIds);
  return json({ categories });
}
