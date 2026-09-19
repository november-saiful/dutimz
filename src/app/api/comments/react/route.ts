export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import { reactToComment } from "@/lib/data/publicApi";
import { enforceRateLimit, validationFailure } from "@/lib/api/http";
import { readJsonBody, validate } from "@/lib/api/validation";
import { commentReactionSchema } from "@/lib/api/schemas";

/**
 * POST /api/comments/react — like or dislike a comment.
 *
 * Reactions are per account (`comment_reactions` keyed by user), so this
 * endpoint requires a session; the counters land in `comments.likes` /
 * `comments.dislikes` via the `cast_comment_reaction` RPC (migration 0008).
 */
export async function POST(request: NextRequest) {
  const denied = enforceRateLimit(request, "reaction");
  if (denied) return denied;

  const json = await readJsonBody(request);
  if (!json.ok) return NextResponse.json({ error: json.error }, { status: 400 });

  const parsed = validate(commentReactionSchema, json.value);
  if (!parsed.ok) return validationFailure(parsed);

  const result = await reactToComment(parsed.data.commentId, parsed.data.reaction);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ comment: result.data });
}
