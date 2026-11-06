import { NextRequest, NextResponse } from "next/server";

import { reportError } from "@/lib/errors";
import { supabaseServer } from "@/lib/supabase";

/*
  The reader's side of the view beacon. It answers 204 to everything: a lost view is not worth a
  console error, and an error response is exactly what a retrying browser (or a curious one) would
  treat as "try again", which is how a count gets double-recorded.

  One beacon feeds two counters. Earnings take the deduplicated row — published story, new device
  for the day, under the daily cap — while the figure printed on the cards is a page view and takes
  every beacon, refreshing or not. Both decisions belong to the database; this route only hands
  them the facts.
*/
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      articleId?: unknown;
      vid?: unknown;
    } | null;
    const articleId = body?.articleId;
    const vid = body?.vid;
    if (
      typeof articleId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        articleId,
      )
    ) {
      return noContent();
    }
    if (typeof vid !== "string" || vid.length < 8 || vid.length > 128) {
      return noContent();
    }
    // Cloudflare's header is the one that survives proxies; the forwarded one is the fallback for
    // local development, and "local" is a shared identity that still lets the dedup logic run.
    const ip =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "local";
    const supabase = supabaseServer();
    const [earning, pageview] = await Promise.all([
      supabase.rpc("record_article_view", {
        p_article_id: articleId,
        p_viewer_ip: ip,
        p_viewer_token: vid,
      }),
      supabase.rpc("record_article_pageview", { p_article_id: articleId }),
    ]);
    if (earning.error) reportError("view beacon", earning.error);
    if (pageview.error) reportError("pageview beacon", pageview.error);
  } catch (error) {
    reportError("view beacon", error);
  }
  return noContent();
}

function noContent() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
