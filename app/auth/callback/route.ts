import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (
          toSet: { name: string; value: string; options?: object }[],
        ) => {
          for (const { name, value } of toSet) {
            cookieStore.set(name, value);
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
