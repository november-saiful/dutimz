export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import { getCommentsByContentId, addComment } from "@/lib/data/publicMock";

/** GET /api/comments?contentId=... — list approved comments for a content item */
export async function GET(request: NextRequest) {
  const contentId = request.nextUrl.searchParams.get("contentId");
  if (!contentId) {
    return NextResponse.json({ error: "contentId is required" }, { status: 400 });
  }
  const comments = getCommentsByContentId(contentId);
  return NextResponse.json({ comments });
}

/** POST /api/comments — create a new comment */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { contentId, parentId, authorName, body: commentBody } = body;

  if (!contentId || !authorName?.trim() || !commentBody?.trim()) {
    return NextResponse.json(
      { error: "contentId, authorName, and body are required" },
      { status: 400 },
    );
  }

  const comment = addComment({
    contentId,
    parentId: parentId ?? null,
    authorName: authorName.trim(),
    body: commentBody.trim(),
  });

  return NextResponse.json({ comment }, { status: 201 });
}
