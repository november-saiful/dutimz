export const runtime = "edge";

import { NextRequest } from "next/server";
import { json, jsonError, hasSupabase } from "@/lib/data/deskApi";
import { listSubscribers, unsubscribeSubscriber } from "@/lib/data/adminMock";

/**
 * GET    /api/admin/newsletter?search=&page= — paginated subscriber list.
 * DELETE /api/admin/newsletter?id=... — soft-unsubscribe a subscriber.
 */

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10);

  if (hasSupabase()) {
    const { requireAdmin } = await import("@/lib/auth/admin");
    const ctx = await requireAdmin();
    if (!ctx) return jsonError("Admin role required", 403);

    const pageSize = 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = ctx.supabase
      .from("newsletter_subscribers")
      .select("*", { count: "exact" })
      .order("subscribed_at", { ascending: false })
      .range(from, to);

    if (search) {
      query = query.ilike("email", `%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) return jsonError(error.message, 500);

    const { count: activeCount } = await ctx.supabase
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);

    return json({
      subscribers: data ?? [],
      total: count ?? 0,
      activeCount: activeCount ?? 0,
    });
  }

  const result = listSubscribers({ search, page, pageSize: 20 });
  return json(result);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return jsonError("`id` query param is required");

  if (hasSupabase()) {
    const { requireAdmin } = await import("@/lib/auth/admin");
    const ctx = await requireAdmin();
    if (!ctx) return jsonError("Admin role required", 403);

    const { data, error } = await ctx.supabase
      .from("newsletter_subscribers")
      .update({ is_active: false, unsubscribed_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return jsonError(error.message, 500);
    return json({ subscriber: data });
  }

  const sub = unsubscribeSubscriber(id);
  if (!sub) return jsonError("Subscriber not found", 404);
  return json({ subscriber: sub });
}
