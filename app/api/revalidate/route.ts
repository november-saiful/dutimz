import { NextResponse } from "next/server";

import { revalidateReadingSurfaces } from "@/lib/revalidate";
import { supabaseForToken } from "@/lib/supabase";

/*
  The desk's way of saying "readers should see this now".

  The public reading surfaces are cached, so that a reader's request is answered from R2 instead of
  paying for a React render (a render per request is what Cloudflare answered with 503, error 1102,
  "Worker exceeded resource limits"). A cached page is only correct while something tells it that
  it changed, and the desk is that something: it knows an approval happened, and Next does not.

  Who may call it: a moderator or an admin, proven by their own Supabase access token and decided
  by the database. The route holds no role list of its own — `is_moderator_or_admin()` is already
  the rule every other desk surface is gated by, so the two can never disagree. An invalidation is
  not a write, but it does force every reader's next request to render that page, so it is not
  something a reader's token should be able to trigger on its own either.

  What it deliberately does not take: a path. The caller says "the desk changed something", and the
  server invalidates the surfaces that can show it. That keeps a compromised or careless caller
  from choosing what to invalidate, and keeps the list of reading surfaces in one place
  (lib/revalidate.ts) instead of in every caller.
*/
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing access token." }, { status: 401 });
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    return NextResponse.json({ error: "Missing access token." }, { status: 401 });
  }

  const supabase = supabaseForToken(token);
  const { data: user, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user?.user) {
    return NextResponse.json({ error: "Invalid access token." }, { status: 401 });
  }

  const { data: allowed, error: roleError } = await supabase.rpc("is_moderator_or_admin");
  if (roleError) {
    // A role that could not be read is not a refusal: reporting 403 here would send a signed-in
    // moderator chasing a permission problem that does not exist.
    return NextResponse.json({ error: "Could not verify the caller's role." }, { status: 503 });
  }
  if (allowed !== true) {
    return NextResponse.json({ error: "Only the desk can refresh what readers see." }, { status: 403 });
  }

  const revalidated = revalidateReadingSurfaces();
  console.log(`Desk invalidation by ${user.user.id}: ${revalidated.join(", ")}`);
  return NextResponse.json(
    { revalidated },
    // Per-caller by construction, and useless to anyone else: never cached.
    { headers: { "Cache-Control": "no-store" } },
  );
}
