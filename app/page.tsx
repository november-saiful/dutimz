import Link from "next/link";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { StoryCarousel } from "@/components/dashboard/story-carousel";
import {
  BlockHead,
  CarouselCard,
  FeatureCard,
  MiniRow,
  PreviewItem,
  StoryMeta,
  StoryTags,
  pick,
  storyItemFromPreview,
  storyItemFromStory,
  storyUrl,
  type StoryItem,
} from "@/components/dashboard/story-blocks";
import {
  getLatestStories,
  isDemoMode,
  previewStories,
} from "@/lib/stories";

/*
  Cached, and invalidated the moment the desk changes what readers see.

  This page used to render on every request, because the 30 second page cache it replaced was only
  ever refreshed by a background regeneration — a story could stay off the front page for hours.
  Rendering per request is what made the front page exceed the Worker's resource limit, though:
  Cloudflare answered 503 (error 1102) to every request for it, and a reader's request paid for a
  full React render or paid with an error page. The cache is now the thing every reader is served
  from, and the desk invalidates it the moment a story is approved, edited, published or withdrawn
  (lib/revalidate.ts, reached through app/api/revalidate/route.ts), so "at once" no longer means
  "re-render for everyone".

  The window below is the fallback, not the mechanism: it bounds how stale the page can be if an
  approval's invalidation never arrives. Regeneration happens in the background queue, off the
  request that triggered it.
*/
export const revalidate = 60;

/** The paper's own horizon, for the hero orb's inner ring: pure decoration. */
function Orb() {
  return (
    <div className="orb" aria-hidden>
      <div className="blob" />
      <div className="ring" />
      <div className="ring2" />
      <div className="shadow" />
    </div>
  );
}

function EmptyDesk() {
  return (
    <section className="block">
      <div className="block-head">
        <span className="flag">প্রধান প্রতিবেদন</span>
      </div>
      <div className="py-12 text-center">
        <h2 className="mb-2 text-2xl font-bold">এখনো কোনো প্রতিবেদন প্রকাশিত হয়নি</h2>
        <p className="text-sm text-muted-foreground">
          সম্পাদকীয় ডেস্কের যাচাই করা খবর এখানে দেখানো হবে। নিজের প্রতিবেদন পাঠাতে{" "}
          <Link href="/account/write/" className="text-primary underline underline-offset-4">
            প্রতিবেদন লিখুন
          </Link>
          ।
        </p>
      </div>
    </section>
  );
}

export default async function HomePage() {
  const demo = isDemoMode();
  // One read serves the whole front page: the hero slots, the rails and the
  // carousels below them all come from the same newest-first list.
  const items: StoryItem[] = demo
    ? previewStories.map(storyItemFromPreview)
    : (await getLatestStories(25)).map(storyItemFromStory);

  const lead = pick(items, 0);
  const previews = [pick(items, 1), pick(items, 2), pick(items, 3)];
  const feature = pick(items, 4);
  const rail = [pick(items, 5), pick(items, 6), pick(items, 7), pick(items, 8)];
  const latest = [0, 1, 2, 3, 4].map((index) => pick(items, index));
  const readersChoice = [9, 10, 11, 12, 13, 14].map((index) => pick(items, index));
  const bestOfMonth = [15, 16, 17, 18, 19, 20].map((index) => pick(items, index));

  return (
    <DutimzShell bare>
      {items.length === 0 || !lead ? (
        <EmptyDesk />
      ) : (
        <>
          {/*
            The hero: the week's best story beside the recommended rail, with
            the three previews beneath it. One story fills the lead slot; the
            orb is the design's decorative anchor behind the copy.
          */}
          <section className="hero-grid" aria-label="প্রধান প্রতিবেদন">
            <div>
              <div className="hero-copy">
                <span className="flag">সপ্তাহের সেরা</span>
                <StoryMeta item={lead} />
                <h1>
                  <Link href={storyUrl(lead)}>{lead.title}</Link>
                </h1>
                <StoryTags item={lead} />
                <Link href={storyUrl(lead)} className="btn-read">
                  প্রতিবেদন পড়ুন{" "}
                  <span className="circ">
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </Link>
                <Orb />
              </div>
              <div className="previews">
                {previews.map(
                  (item, index) => item && <PreviewItem key={`${item.slug}-${index}`} item={item} />,
                )}
              </div>
            </div>

            <aside className="hero-aside">
              <div className="aside-head">
                <h3>প্রস্তাবিত</h3>
                <Link href="/search/" className="viewall">
                  সব দেখুন
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </div>
              {feature && <FeatureCard item={feature} />}
              <div>
                {rail.map(
                  (item, index) => item && <MiniRow key={`${item.slug}-${index}`} item={item} />,
                )}
              </div>
            </aside>
          </section>

          {/* The newest reports, as the design's full-width thumbnail rows. */}
          <section className="block" aria-label="সর্বশেষ প্রতিবেদন">
            <BlockHead flag="সর্বশেষ খবর" moreHref="/search/" />
            {latest.map(
              (item, index) => item && <MiniRow key={`${item.slug}-${index}`} item={item} large />,
            )}
          </section>

          <section className="block" aria-label="পাঠকের পছন্দ">
            <BlockHead flag="পাঠকের পছন্দ" moreHref="/search/" />
            <StoryCarousel label="পাঠকের পছন্দ">
              {readersChoice.map(
                (item, index) =>
                  item && <CarouselCard key={`${item.slug}-${index}`} item={item} />,
              )}
            </StoryCarousel>
          </section>

          <section className="block" aria-label="মাসের সেরা">
            <BlockHead flag="মাসের সেরা" moreHref="/search/" />
            <StoryCarousel label="মাসের সেরা">
              {bestOfMonth.map(
                (item, index) =>
                  item && <CarouselCard key={`${item.slug}-${index}`} item={item} />,
              )}
            </StoryCarousel>
          </section>
        </>
      )}
    </DutimzShell>
  );
}
