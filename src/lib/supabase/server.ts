import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server client bound to the request's cookies. Throws when Supabase env
 * vars are missing — callers that support the no-Supabase dev fallback
 * should check hasSupabaseEnv() (src/lib/supabase/config.ts) first.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore when the
            // middleware refreshes sessions.
          }
        },
      },
    },
  );
}
