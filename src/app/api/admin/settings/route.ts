export const runtime = "edge";

import { NextRequest } from "next/server";
import { json, jsonError, hasSupabase } from "@/lib/data/deskApi";
import { getSettings, updateSettings } from "@/lib/data/adminMock";

/**
 * GET /api/admin/settings — returns the single site_settings row.
 * PUT /api/admin/settings — upserts settings fields.
 */

export async function GET() {
  if (hasSupabase()) {
    const { requireAdmin } = await import("@/lib/auth/admin");
    const ctx = await requireAdmin();
    if (!ctx) return jsonError("Admin role required", 403);

    const { data, error } = await ctx.supabase
      .from("site_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) return jsonError(error.message, 500);
    return json({ settings: data ?? getSettings() });
  }

  return json({ settings: getSettings() });
}

export async function PUT(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  if (hasSupabase()) {
    const { requireAdmin } = await import("@/lib/auth/admin");
    const ctx = await requireAdmin();
    if (!ctx) return jsonError("Admin role required", 403);

    const allowed = [
      "site_name", "site_tagline", "logo_url", "favicon_url",
      "primary_color", "secondary_color", "accent_color",
      "social_links", "seo_defaults", "analytics_id", "maintenance_mode",
    ];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await ctx.supabase
      .from("site_settings")
      .upsert({ id: 1, ...patch }, { onConflict: "id" })
      .select("*")
      .single();
    if (error) return jsonError(error.message, 500);
    return json({ settings: data });
  }

  const settings = updateSettings(body as Parameters<typeof updateSettings>[0]);
  return json({ settings });
}
