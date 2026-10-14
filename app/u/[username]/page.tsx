import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { PublicProfile } from "@/components/profile/public-profile";

/*
  Cached shell: PublicProfile fetches the member's data client-side, so caching
  this shell costs no freshness and serves profile visits from the page cache.
*/
export const revalidate = 60;

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
