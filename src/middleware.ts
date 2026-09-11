import { type NextRequest, NextResponse } from "next/server";
import type { CookieOptionsWithName } from "@supabase/ssr";
import { createServerClient } from "@supabase/ssr";
import {
  requiredRoleForPath,
  isAuthRoute,
  buildLoginRedirectPath,
  hasRole,
  type UserRole,
} from "@/lib/auth/rbac";
import { AUTH } from "@/lib/auth/config";
import { hasSupabaseEnv } from "@/lib/supabase/config";

/**
 * Edge middleware (Phase 2):
 *  1. Refreshes the Supabase session on every matched request.
 *  2. Guards protected routes by the user's profile role.
 *  3. Bounces logged-in users away from login/register.
 *
 * Role lookup: read the `role` claim from the JWT user metadata. The
 * `handle_new_user` trigger (migration 0004) keeps `raw_user_meta_data.role`
 * in sync with `public.profiles.role`, so middleware never needs a DB call.
 *
 * Without Supabase env vars (local dev fallback) auth is skipped entirely —
 * every route stays public, mirroring the mock-data mode of the data layer.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!hasSupabaseEnv()) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptionsWithName }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser() —
  // that call refreshes expired auth tokens and re-issues cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = (user?.user_metadata?.role as UserRole | undefined) ?? null;

  // 1) Signed-in users should not see login/register pages.
  if (user && isAuthRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = AUTH.profilePath;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 2) Role-based route guards.
  const minRole = requiredRoleForPath(pathname);
  if (minRole) {
    if (!user) {
      const url = request.nextUrl.clone();
      const loginUrl = new URL(buildLoginRedirectPath(pathname, search), request.nextUrl.origin);
      url.pathname = loginUrl.pathname;
      url.search = loginUrl.search;
      return NextResponse.redirect(url);
    }
    if (!hasRole(role, minRole)) {
      // Signed in but not privileged enough — 403 page via rewrite, or plain 403.
      const url = request.nextUrl.clone();
      url.pathname = "/auth/forbidden";
      url.search = "";
      return NextResponse.rewrite(url, { status: 403 });
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets, images, and Next internals.
     * `_next/static`, `_next/image`, favicon, fonts, manifest.
     */
    "/((?!_next/static|_next/image|favicon.ico|fonts/|images/|icons/|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
