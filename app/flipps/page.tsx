import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import {
  flippsFromPreview,
  flippsFromStory,
  type FlippsItem,
} from "@/components/flipps/flipps-data";
import { FlippsReels } from "@/components/flipps/flipps-reels";
import { getLatestStories, isDemoMode, previewStories } from "@/lib/stories";

// Rendered per request, like the front page and every article: a report approved a moment ago
// belongs in the feed a moment later, and a cached reel deck would keep showing the old order.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ফ্লিপস",
  description:
    "ঢাকা বিশ্ববিদ্যালয়ের প্রতিবেদন একের পর এক — ছবি, শিরোনাম আর দুই লাইনে সংক্ষেপে।",
  alternates: { canonical: "/flipps/" },
};

/**
 * How many reports the deck carries. Long enough that the feed does not run out mid-read, short
 * enough that the page does not send the whole archive to draw twelve cards.
 */
const REEL_COUNT = 12;

function NoReels() {
  return (
    <div className="border border-dashed border-border px-5 py-16 text-center">
      <h2 className="mb-2 text-2xl font-bold">এখনো কোনো ফ্লিপ নেই</h2>
      <p className="text-xs text-muted-foreground">
        নতুন প্রতিবেদন প্রকাশিত হলে এখানে একের পর এক দেখা যাবে।
      </p>
    </div>
  );
}

export default async function FlippsPage() {
  const items: FlippsItem[] = isDemoMode()
    ? previewStories.map(flippsFromPreview)
    : (await getLatestStories(REEL_COUNT)).map(flippsFromStory);

  return (
    <DutimzShell title="ফ্লিপস" crumbs={[{ label: "ফ্লিপস" }]}>
      {items.length === 0 ? <NoReels /> : <FlippsReels items={items} />}
    </DutimzShell>
  );
}
