import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthProfile } from "@/lib/auth/server";

export interface AdminContext {
  profile: Profile;
  supabase: SupabaseClient;
}

/**
 * Guard for admin-only server components and API routes.
 * Returns the admin Supabase client (service-role, bypasses RLS) plus the
 * authenticated admin profile. Throws (returns null) when:
 *  - No user is signed in
 *  - The user is not an admin
 *  - SUPABASE_SERVICE_ROLE_KEY is not configured
 *
 * Usage in API routes:
 *   const ctx = await requireAdmin();
 *   if (!ctx) return jsonError("Admin role required", 403);
 *   const { supabase } = ctx;
 */
export async function requireAdmin(): Promise<AdminContext | null> {
  const profile = await getAuthProfile();
  if (!profile || profile.role !== "admin") return null;

  try {
    const supabase = getSupabaseAdminClient();
    return { profile, supabase };
  } catch {
    // Service role key not configured — fall back gracefully
    return null;
  }
}

/**
 * Guard for moderator+ routes (moderator or admin).
 * Returns a regular server client (respects RLS) since moderators
 * already have RLS policies granting access.
 */
export async function requireModerator(): Promise<{ profile: Profile; supabase: SupabaseClient } | null> {
  const profile = await getAuthProfile();
  if (!profile || !["moderator", "admin"].includes(profile.role)) return null;

  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServerClient();
  return { profile, supabase };
}
