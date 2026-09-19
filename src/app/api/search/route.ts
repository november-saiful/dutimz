import { NextRequest, NextResponse } from "next/server";
import { searchContents } from "@/lib/content/search";
import { enforceRateLimit, validationFailure } from "@/lib/api/http";
import { searchQuerySchema } from "@/lib/api/schemas";
import { validate } from "@/lib/api/validation";

export const runtime = "edge";

/**
 * GET /api/search?q=&limit=&type=&category=
 *
 * Thin HTTP layer over `searchContents` (src/lib/content/search.ts), which
 * owns the Supabase/mock branching so the query construction — and the
 * PostgREST escaping — lives in exactly one place.
 *
 * Unauthenticated, so it is budgeted at 60 searches/min per IP (spec §9.4):
 * each miss is a `content`/`title` ILIKE scan, which is the cheapest way for
 * a stranger to make the database work.
 */
export async function GET(request: NextRequest) {
  const denied = enforceRateLimit(request, "search");
  if (denied) return denied;

  const url = new URL(request.url);
  const parsed = validate(searchQuerySchema, {
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    type: url.searchParams.get("type"),
    category: url.searchParams.get("category"),
  });
  if (!parsed.ok) return validationFailure(parsed);

  const { q, limit, type, category } = parsed.data;
  const result = await searchContents(q, limit, 0, {
    contentType: type ?? null,
    categoryId: category ?? null,
  });
  return NextResponse.json(result);
}
