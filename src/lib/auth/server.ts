import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { hasRole } from "@/lib/auth/rbac";

export interface AuthContext {
  user: User | null;
  profile: Profile | null;
  role: Profile["role"] | null;
}

/** Fetch the signed-in Supabase Auth user (null when signed out or unconfigured). */
export async function getAuthUser(): Promise<User | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Fetch the profile row for the signed-in user. Returns null when signed out
 * or when the profile row does not exist yet (the DB trigger in migration
 * 0004 creates it on first sign-in).
 */
export async function getAuthProfile(): Promise<Profile | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

/** Combined user + profile + role context for server components. */
export async function getAuthContext(): Promise<AuthContext> {
  const user = await getAuthUser();
  if (!user) return { user: null, profile: null, role: null };

  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  const profile = (data as Profile | null) ?? null;
  return { user, profile, role: profile?.role ?? null };
}

/**
 * Guard for server components/actions: returns the profile when the user is
 * signed in and holds at least `minRole`, otherwise null. Use alongside the
 * middleware guard — this is defense in depth for page-level data fetches.
 */
export async function requireAuth(
  minRole: Parameters<typeof hasRole>[1] = "visitor",
): Promise<Profile | null> {
  const profile = await getAuthProfile();
  if (!profile) return null;
  return hasRole(profile.role, minRole) ? profile : null;
}
