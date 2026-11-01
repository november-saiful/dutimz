import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { reportError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";

/*
  The money half of the view pipeline: settle complete ten-view batches into the ledger.

  Called every hour by the media Worker's cron. The token check is the same shape as the cache
  refresh's for the same reason: a scheduled job has no session, the secret is a Worker secret,
  and an unauthenticated caller here could credit money — so without the token configured this
  route refuses outright rather than falling open.

  The settlement itself runs under the database's service role (see `supabaseAdmin`), because no
  reader account may settle its own view income; the SQL side applies the advisory lock, marks the
  counted rows settled in the same transaction, and credits complete batches only.
*/
export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";

  let expected = "";
  try {
    const { env } = getCloudflareContext();
    expected =
      (env as CloudflareEnv & { VIEWS_SETTLE_TOKEN?: string })
        .VIEWS_SETTLE_TOKEN ?? "";
  } catch {
    return refusal("The Worker context is unavailable.", 503);
  }
  if (!expected) {
    return refusal("VIEWS_SETTLE_TOKEN is not set on the Worker.", 503);
  }
  if (!token || !sameSecret(token, expected)) {
    return refusal("Invalid settlement token.", 401);
  }

  try {
    const { data, error } = await supabaseAdmin().rpc(
      "settle_article_view_earnings",
    );
    if (error) {
      reportError("view settlement", error);
      return refusal("Settlement failed.", 502);
    }
    return NextResponse.json(
      { settled: data ?? 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    reportError("view settlement", error);
    return refusal("Settlement failed.", 502);
  }
}

function refusal(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Compares without returning early: the token is the only thing standing between a stranger and a credit. */
function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < given.length; index += 1) {
    difference |= given.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}
