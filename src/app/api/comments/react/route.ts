export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import { reactToComment } from "@/lib/data/publicMock";

/** POST /api/comments/react — like or dislike a comment */
export async function POST(request: NextRequest) {
  const { commentId, reaction } = await request.json();

  if (!commentId || !["like", "dislike"].includes(reaction)) {
    return NextResponse.json(
      { error: "commentId and reaction (like|dislike) are required" },
      { status: 400 },
    );
  }

  const updated = reactToComment(commentId, reaction);
  if (!updated) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  return NextResponse.json({ comment: updated });
}
