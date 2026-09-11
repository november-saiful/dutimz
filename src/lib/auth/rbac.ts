import { ROLE_HIERARCHY, type UserRole } from "@/lib/constants/app";

export type { UserRole };

/** Numeric rank of a role; higher = more privileged. Unknown roles rank 0. */
export function roleLevel(role: UserRole | string | null | undefined): number {
  if (!role) return 0;
  return ROLE_HIERARCHY[role as UserRole] ?? 0;
}

/** True when the role meets or exceeds the minimum required role. */
export function hasRole(
  role: UserRole | string | null | undefined,
  min: UserRole,
): boolean {
  return roleLevel(role) >= ROLE_HIERARCHY[min];
}

/** True when the role is one of the listed roles. */
export function hasAnyRole(
  role: UserRole | string | null | undefined,
  roles: readonly UserRole[],
): boolean {
  if (!role) return false;
  return roles.includes(role as UserRole);
}

/** True when the role can create/edit content (reporter and above). */
export function isEditorRole(role: UserRole | string | null | undefined): boolean {
  return hasRole(role, "reporter");
}

/** True when the role can moderate comments/content (moderator and above). */
export function isModeratorRole(role: UserRole | string | null | undefined): boolean {
  return hasRole(role, "moderator");
}

/** True when the role can manage users/settings (admin only). */
export function isAdminRole(role: UserRole | string | null | undefined): boolean {
  return hasRole(role, "admin");
}

// ---------------------------------------------------------------------------
// Route guards — consumed by src/middleware.ts
// ---------------------------------------------------------------------------

export interface RouteRule {
  /** Path prefix the rule applies to, e.g. "/profile". */
  prefix: string;
  /** Minimum role required. */
  minRole: UserRole;
}

/**
 * Protected path prefixes, most specific first. Public routes are simply not
 * listed. `minRole: "visitor"` means "any authenticated user".
 */
export const PROTECTED_ROUTES: readonly RouteRule[] = [
  { prefix: "/admin", minRole: "admin" },
  { prefix: "/moderator", minRole: "moderator" },
  { prefix: "/reporter", minRole: "reporter" },
  { prefix: "/profile", minRole: "visitor" },
  { prefix: "/bookmarks", minRole: "visitor" },
] as const;

/** Result of evaluating a pathname against the protected route table. */
export interface GuardResult {
  /** Minimum role required to view the path, or null when it is public. */
  minRole: UserRole | null;
}

/** Resolve the minimum role a path requires; null means public. */
export function requiredRoleForPath(pathname: string): UserRole | null {
  for (const rule of PROTECTED_ROUTES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.minRole;
    }
  }
  return null;
}

/** Auth pages a logged-in user should be redirected away from. */
export const AUTH_ROUTES: readonly string[] = ["/auth/login", "/auth/register"] as const;

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/** Where to send the user after a successful login. */
export const LOGIN_REDIRECT_PATH = "/profile";

/** Where to send an unauthenticated visitor to reach a protected page. */
export function buildLoginRedirectPath(pathname: string | null, search: string | null): string {
  const next = pathname ? `${pathname}${search ?? ""}` : null;
  return next
    ? `/auth/login?next=${encodeURIComponent(next)}`
    : "/auth/login";
}
