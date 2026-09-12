export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import { votePoll } from "@/lib/data/pollMock";

/** POST /api/polls/vote — cast a vote on a poll option */
export async function POST(request: NextRequest) {
  const { pollId, optionId } = await request.json();

  if (!pollId || !optionId) {
    return NextResponse.json(
      { error: "pollId and optionId are required" },
      { status: 400 },
    );
  }

  const poll = votePoll(pollId, optionId);
  if (!poll) {
    return NextResponse.json({ error: "Poll or option not found" }, { status: 404 });
  }

  return NextResponse.json({ poll });
}
