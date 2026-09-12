export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AUTH } from "@/lib/auth/config";

/**
 * OAuth callback: exchanges the PKCE code for a session, then redirects to
 * `next` (relative paths only, to avoid open redirects) or to /profile.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? AUTH.profilePath;

  // Only allow same-origin relative redirects.
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : AUTH.profilePath;

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Missing/invalid code — back to login.
  return NextResponse.redirect(`${origin}${AUTH.loginPath}?error=oauth`);
}
