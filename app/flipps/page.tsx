import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import {
  REEL_COUNT,
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
    ? previewStories.slice(0, REEL_COUNT).map(flippsFromPreview)
    : (await getLatestStories(REEL_COUNT)).map(flippsFromStory);

  return (
    // `bare` + `mobileDeck`: a deck of full-screen cards draws its own container. On phones the
    // shell drops the footer and this wrapper stays full-bleed; at and above the dock breakpoint
    // it is the same centered column as before.
    <DutimzShell bare mobileDeck>
      {/* On phones the deck starts under the top bar and ends under the dock, so both negative
          margins cancel the room those pieces of chrome still take in flow — the picture is what
          the glass chrome floats over. */}
      <div className="w-full min-w-0 max-[860px]:-mt-[var(--topbar)] max-[860px]:mb-[calc(-1*var(--dock))] min-[861px]:mx-auto min-[861px]:max-w-[var(--maxw)] min-[861px]:px-7 min-[861px]:py-3">
        {items.length === 0 ? <NoReels /> : <FlippsReels items={items} />}
      </div>
    </DutimzShell>
  );
}
