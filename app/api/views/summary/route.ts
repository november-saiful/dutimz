import { NextRequest, NextResponse } from "next/server";

import { getFeedViewSummary } from "@/lib/stories";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IDS = 50;

/*
  The cards' own numbers, re-read after the page loads.

  The front page is cached, so the totals baked into it can be minutes old — long enough for a
  reader who just opened a story to look back at its card and see the old figure. The browser
  asks here for the same batched summary the page was built from, once for every card on the
  screen, and the cards replace their first paint with it. Read-only and public: the aggregate
  is all it answers, never one reader's row.
*/
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("ids") ?? "";
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => UUID.test(id)),
    ),
  ].slice(0, MAX_IDS);
  const summary = ids.length
    ? await getFeedViewSummary(ids)
    : new Map<string, number>();
  return NextResponse.json(
    { counts: Object.fromEntries(summary) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
