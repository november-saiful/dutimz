import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Browsers cap a `Set-Cookie` lifetime at 400 days, so this is the longest a session can be
 * remembered without signing in again. It must match the browser client's options in
 * `lib/supabase.ts`: a cookie written here with a shorter life than the client renews would let
 * the session lapse even while the reader is still using the site.
 */
const SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  // There is no sign-in page to fall back to: a callback without a code (a
  // cancelled or mistyped round-trip) simply returns the reader home, where the
  // account menu still offers the Google button.
  if (!code) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        httpOnly: false,
        maxAge: SESSION_MAX_AGE_SECONDS,
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (
          toSet: { name: string; value: string; options?: object }[],
        ) => {
          /*
            The options Supabase hands over carry the cookie's lifetime. Dropping them made Next
            write a plain session cookie — no `maxAge`, so the browser discarded it the moment it
            closed and the reader was silently signed out on their next visit. The whole object
            has to survive the trip into `cookies().set`.
          */
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, {
              path: "/",
              sameSite: "lax",
              httpOnly: false,
              maxAge: SESSION_MAX_AGE_SECONDS,
              ...options,
            });
          }
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const destination = next.startsWith("/") ? next : "/";
  return NextResponse.redirect(new URL(destination, request.url));
}
