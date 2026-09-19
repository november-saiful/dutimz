export const runtime = "edge";

import { NextRequest } from "next/server";
import { hasSupabase, json, jsonError } from "@/lib/data/deskApi";

/**
 * GET /api/reporter/contents/check-slug?slug=xxx&excludeId=yyy
 *
 * Returns { available: boolean } — lightweight duplicate check the editor
 * calls on every keystroke (debounced) so the reporter sees a red warning
 * before they even try to save.
 */

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim();
  if (!slug || slug.length < 2) {
    return json({ available: true });
  }

  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const { getAuthProfile } = await import("@/lib/auth/server");
    const profile = await getAuthProfile();
    if (!profile) return jsonError("Authentication required", 401);

    const supabase = createSupabaseServerClient();
    let query = supabase
      .from("contents")
      .select("id", { count: "exact", head: true })
      .eq("slug", slug)
      .neq("status", "archived");

    const excludeId = request.nextUrl.searchParams.get("excludeId");
    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { count } = await query;
    return json({ available: (count ?? 0) === 0 });
  }

  // Mock mode: slugs are unique by construction (timestamp suffix), so
  // treat every slug as available.
  return json({ available: true });
}
