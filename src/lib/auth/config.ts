/** Supabase Auth configuration for DUTIMZ (Phase 2: Google-only OAuth). */
export const AUTH = {
  /** Only provider enabled in Phase 2. */
  provider: "google" as const,
  /** Route Supabase redirects back to after OAuth consent. */
  callbackPath: "/auth/callback",
  /** Where users land after login / logout. */
  homePath: "/",
  profilePath: "/profile",
  loginPath: "/auth/login",
  /** Session cookie handling is done by @supabase/ssr under this chunk. */
  cookieNamePrefix: "sb",
} as const;

export type AuthProvider = (typeof AUTH)["provider"];
