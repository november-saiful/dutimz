export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import { castPollVote } from "@/lib/data/publicApi";
import { enforceRateLimit, validationFailure } from "@/lib/api/http";
import { readJsonBody, validate } from "@/lib/api/validation";
import { pollVoteSchema } from "@/lib/api/schemas";

/**
 * POST /api/polls/vote — cast a vote on a poll option.
 *
 * One vote per account per poll (`poll_votes` UNIQUE(poll_id, user_id)), so a
 * session is required. Counts live in `polls.options` and are updated by the
 * `cast_poll_vote` RPC (migration 0008) — that keeps results public without
 * exposing who voted for what.
 */
export async function POST(request: NextRequest) {
  // Bounded because a rejected vote (closed poll, missing option) is still a
  // database round trip; the UNIQUE constraint catches repeat voting.
  const denied = enforceRateLimit(request, "poll");
  if (denied) return denied;

  const json = await readJsonBody(request);
  if (!json.ok) return NextResponse.json({ error: json.error }, { status: 400 });

  const parsed = validate(pollVoteSchema, json.value);
  if (!parsed.ok) return validationFailure(parsed);

  const result = await castPollVote(parsed.data.pollId, parsed.data.optionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ poll: result.data });
}
