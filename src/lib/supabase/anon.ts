import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let anonClient: SupabaseClient | null = null;

/**
 * Cookie-less anon client for *public* reads (approved comments, active polls).
 *
 * Deliberately does NOT read `cookies()`: calling that from a React Server
 * Component opts the whole route into dynamic rendering, which would disable
 * the `revalidate = 60` caching on the article pages. Anything that needs the
 * visitor's session must use `createSupabaseServerClient()` instead.
 *
 * Returns null when Supabase env vars are absent (mock mode).
 */
export function createSupabaseAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (anonClient) return anonClient;

  anonClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return anonClient;
}
