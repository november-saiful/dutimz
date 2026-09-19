export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import {
  listBookmarkedContents,
  listBookmarkIds,
  toggleBookmark,
} from "@/lib/data/publicApi";
import { enforceRateLimit, validationFailure } from "@/lib/api/http";
import { readJsonBody, validate } from "@/lib/api/validation";
import { bookmarkSchema } from "@/lib/api/schemas";

/**
 * GET  /api/bookmarks — the signed-in user's bookmarks.
 *        ?contents=1 also returns the bookmarked content rows (with relations)
 *        so the bookmark page can render real stories instead of guessing.
 * POST /api/bookmarks — toggle a bookmark for the signed-in user.
 *
 * Bookmarks are private per user (`bookmarks` RLS: auth.uid() = user_id), so
 * both verbs return 401 when there is no session.
 */
export async function GET(request: NextRequest) {
  const wantContents = ["1", "true"].includes(
    request.nextUrl.searchParams.get("contents") ?? "",
  );

  if (wantContents) {
    const result = await listBookmarkedContents();
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      contentIds: result.data.map((content) => content.id),
      contents: result.data,
    });
  }

  const result = await listBookmarkIds();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ contentIds: result.data });
}

export async function POST(request: NextRequest) {
  const denied = enforceRateLimit(request, "bookmark");
  if (denied) return denied;

  const json = await readJsonBody(request);
  if (!json.ok) return NextResponse.json({ error: json.error }, { status: 400 });

  const parsed = validate(bookmarkSchema, json.value);
  if (!parsed.ok) return validationFailure(parsed);

  const result = await toggleBookmark(parsed.data.contentId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ bookmarked: result.data });
}
