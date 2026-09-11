/** Shared helpers for the /api/reporter and /api/moderator route handlers. */

export function hasSupabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

export function jsonError(
  message: string,
  status: number = 400,
  extra?: Record<string, unknown>,
): Response {
  return json({ error: message, ...extra }, { status });
}
