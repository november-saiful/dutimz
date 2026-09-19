export const runtime = "edge";

import { NextRequest } from "next/server";
import { json, jsonError, hasSupabase } from "@/lib/data/deskApi";
import { postgrestIlikePattern } from "@/lib/content/search";
import { ROLE_HIERARCHY } from "@/lib/constants/app";
import { listUsers, updateUser } from "@/lib/data/adminMock";

/**
 * GET /api/admin/users?search=&role=&page= — paginated profiles list.
 * PATCH /api/admin/users — { id, role?, is_verified? } update user.
 */

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  const role = request.nextUrl.searchParams.get("role") ?? undefined;
  const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10);

  if (hasSupabase()) {
    const { requireAdmin } = await import("@/lib/auth/admin");
    const ctx = await requireAdmin();
    if (!ctx) return jsonError("Admin role required", 403);

    const pageSize = 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = ctx.supabase
      .from("profiles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) {
      const pattern = postgrestIlikePattern(search);
      query = query.or(
        `username.ilike.${pattern},email.ilike.${pattern},display_name.ilike.${pattern}`,
      );
    }
    if (role) {
      query = query.eq("role", role);
    }

    const { data, error, count } = await query;
    if (error) return jsonError(error.message, 500);
    return json({ users: data ?? [], total: count ?? 0 });
  }

  const result = listUsers({ search, role, page, pageSize: 20 });
  return json(result);
}

export async function PATCH(request: NextRequest) {
  let body: { id?: string; role?: string; is_verified?: boolean };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  if (!body.id) return jsonError("`id` is required");
  if (body.role !== undefined && !(body.role in ROLE_HIERARCHY)) {
    return jsonError(
      `Invalid role. Expected one of: ${Object.keys(ROLE_HIERARCHY).join(", ")}`,
    );
  }

  if (hasSupabase()) {
    const { requireAdmin } = await import("@/lib/auth/admin");
    const ctx = await requireAdmin();
    if (!ctx) return jsonError("Admin role required", 403);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.role !== undefined) patch.role = body.role;
    if (body.is_verified !== undefined) patch.is_verified = body.is_verified;

    const { data, error } = await ctx.supabase
      .from("profiles")
      .update(patch)
      .eq("id", body.id)
      .select("*")
      .single();
    if (error) return jsonError(error.message, 500);
    return json({ user: data });
  }

  const updated = updateUser(body.id, {
    ...(body.role !== undefined ? { role: body.role as "visitor" | "reporter" | "moderator" | "admin" } : {}),
    ...(body.is_verified !== undefined ? { is_verified: body.is_verified } : {}),
  });
  if (!updated) return jsonError("User not found", 404);
  return json({ user: updated });
}
