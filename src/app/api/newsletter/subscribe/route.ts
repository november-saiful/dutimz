export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import { subscribeToNewsletter } from "@/lib/data/publicApi";
import { enforceRateLimit, validationFailure } from "@/lib/api/http";
import { readJsonBody, validate } from "@/lib/api/validation";
import { newsletterLocale, newsletterSubscribeSchema } from "@/lib/api/schemas";

/**
 * POST /api/newsletter/subscribe — subscribe an email address.
 *
 * Writes to `newsletter_subscribers` when Supabase is configured (RLS allows
 * anonymous inserts; a duplicate email surfaces as 23505 and is reported as
 * `already_subscribed`). Falls back to the in-memory store in mock mode.
 *
 * Tightest budget of the public writes (5/min per IP): this is the endpoint
 * most attractive to a script, since it is anonymous and writes an address.
 */
export async function POST(request: NextRequest) {
  const denied = enforceRateLimit(request, "newsletter");
  if (denied) return denied;

  const json = await readJsonBody(request);
  if (!json.ok) return NextResponse.json({ error: json.error }, { status: 400 });

  const parsed = validate(newsletterSubscribeSchema, json.value);
  if (!parsed.ok) return validationFailure(parsed);

  const result = await subscribeToNewsletter(
    parsed.data.email,
    newsletterLocale(parsed.data),
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, message: result.data.message });
}
