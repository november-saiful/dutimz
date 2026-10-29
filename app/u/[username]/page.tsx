import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { PublicProfile } from "@/components/profile/public-profile";

/*
  Rendered per request, deliberately — and it is the only public route that is.

  There is no member's data in this HTML: PublicProfile fetches it client-side, so the shell is
  identical for every username. The set of usernames is not: any string answers 200 here, so the
  URL space is unbounded and nothing narrows it. A crawler or a scanner walking `/u/...` therefore
  minted a cache entry per invented name, and every one of them went stale and asked to be
  regenerated on the next visit — an endless queue of background work, on a route whose shell has
  nothing in it that could go out of date.

  Rendering per request takes the route out of the incremental cache entirely: no entry, no tag
  lookup, no regeneration. The shell is two components and no query, which is cheaper than the
  bookkeeping it replaces (see open-next.config.ts for what that bookkeeping cost).
*/
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username}`,
    description: "DUTIMZ সদস্যের প্রকাশ্য পরিচয় ও প্রকাশিত প্রতিবেদন।",
    alternates: { canonical: `/u/${username}/` },
  };
}

/*
  The member's page draws itself: `bare` hands it the viewport so the band can run
  edge to edge inside the page's own measure, the way the front page and the
  article view do. That is also why there is no breadcrumb head here — the page
  carries the member's name as its own h1, and a second heading above it would
  only push the identity further down.
*/
export default async function UserPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const decoded = (() => {
    try {
      return decodeURIComponent(username);
    } catch {
      return username;
    }
  })();
  return (
    <DutimzShell bare>
      <PublicProfile username={decoded} />
    </DutimzShell>
  );
}
