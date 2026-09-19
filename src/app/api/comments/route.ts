export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import { createComment, listComments } from "@/lib/data/publicApi";
import { enforceRateLimit, validationFailure } from "@/lib/api/http";
import { readJsonBody, validate } from "@/lib/api/validation";
import { createCommentSchema } from "@/lib/api/schemas";

/**
 * GET  /api/comments?contentId=... — approved comments for a content item.
 * POST /api/comments              — create a comment (authentication required).
 *
 * Backed by the `comments` table when Supabase is configured (RLS: public
 * read of approved rows, insert only as yourself); the in-memory store is
 * used only when there is no Supabase env.
 */
export async function GET(request: NextRequest) {
  // Read-mostly and already cached upstream, so only the write is budgeted.
  const contentId = request.nextUrl.searchParams.get("contentId");
  if (!contentId) {
    return NextResponse.json({ error: "contentId is required" }, { status: 400 });
  }
  const comments = await listComments(contentId);
  return NextResponse.json({ comments });
}

export async function POST(request: NextRequest) {
  // Budgeted per IP before the body is even read (spec §9.4: 30 comments/min).
  const denied = enforceRateLimit(request, "comment");
  if (denied) return denied;

  const json = await readJsonBody(request);
  if (!json.ok) return NextResponse.json({ error: json.error }, { status: 400 });

  const parsed = validate(createCommentSchema, json.value);
  if (!parsed.ok) return validationFailure(parsed);
  const { contentId, parentId, authorName, body } = parsed.data;

  const result = await createComment({
    contentId,
    parentId: parentId ?? null,
    authorName,
    body,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ comment: result.data }, { status: 201 });
}
