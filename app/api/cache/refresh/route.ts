import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { refreshCachedPages } from "@/lib/cache-refresh";
import { readingPagesToRefresh } from "@/lib/revalidate";

/*
  The scheduled half of the cache: re-render the pages every reader sees.

  Nothing a reader does triggers a render (see open-next.config.ts), and the desk only refreshes
  after it changes something — so a page whose `revalidate` window has passed would otherwise
  stay as it was until the next approval. A cron trigger on the media Worker calls this every
  five minutes; it is the only other caller.

  Why a secret and not a signed-in moderator: a scheduled job has no session. The token is a
  Worker secret (`CACHE_REFRESH_TOKEN`), and without it configured this route refuses outright
  rather than falling open — an unauthenticated caller here can force the site to render, which
  is the one thing this codebase spends its effort preventing.

  What it deliberately does not do is invalidate: `revalidatePath` marks every article stale, and
  the archive is not refreshed (see `readingPagesToRefresh`), so it would only downgrade pages
  that are correct. The HEAD request already forces a render; the tag cache is the desk's tool.
*/
export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  let expected = "";
  try {
    const { env } = getCloudflareContext();
    expected = (env as CloudflareEnv & { CACHE_REFRESH_TOKEN?: string }).CACHE_REFRESH_TOKEN ?? "";
  } catch {
    return refusal("The Worker context is unavailable.", 503);
  }
  if (!expected) {
    return refusal("CACHE_REFRESH_TOKEN is not set on the Worker.", 503);
  }
  if (!token || !sameSecret(token, expected)) {
    return refusal("Invalid refresh token.", 401);
  }

  const refreshed = await refreshCachedPages(await readingPagesToRefresh({ includeArticles: false }));
  return NextResponse.json({ refreshed }, { headers: { "Cache-Control": "no-store" } });
}

function refusal(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Compares without returning early: the token is the only thing standing between a stranger and a render. */
function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < given.length; index += 1) {
    difference |= given.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}
