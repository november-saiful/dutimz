import Link from "next/link";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { Flag } from "@/components/dashboard/flag";
import { StoryCarousel } from "@/components/dashboard/story-carousel";
import {
  BlockHead,
  CarouselCard,
  FeatureCard,
  MiniRow,
  deckItemFromStory,
  pick,
  storyItemFromPreview,
  storyItemFromStory,
  type StoryItem,
} from "@/components/dashboard/story-blocks";
import { CalendlyCarousel } from "@/components/ui/connected-carousel";
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

  Five minutes rather than one, because the desk is what keeps this page current: an approval
  invalidates it outright, so a shorter window bought nothing except a background regeneration of
  the whole front page every minute — which is the load that exhausted the Durable Object quota
  (open-next.config.ts).
*/
export const revalidate = 300;

function EmptyDesk() {
  return (
    <section className="block">
      <div className="block-head">
        <Flag label="প্রধান প্রতিবেদন" />
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

  // The lead band is a deck over the week's five newest reports: the design
  // shows the card in focus plus two neighbours on either side, so five is the
  // smallest deck that fills the ring without a story appearing twice.
  const deck = [0, 1, 2, 3, 4]
    .map((slot) => pick(items, slot))
    .filter((item): item is StoryItem => item !== null)
    .map(deckItemFromStory);
  // The latest rows mirror the deck's five newest on purpose: a new story has
  // to appear in সর্বশেষ too, not only in the hero. Every band below them reads
  // on from slot 5, so nothing below is printed a third time.
  const feature = pick(items, 5);
  const rail = [6, 7, 8, 9].map((slot) => pick(items, slot));
  const latest = [0, 1, 2, 3, 4].map((slot) => pick(items, slot));
  const readersChoice = [15, 16, 17, 18, 19].map((slot) => pick(items, slot));
  const bestOfMonth = [20, 21, 22, 23, 24].map((slot) => pick(items, slot));

  return (
    <DutimzShell bare>
      {items.length === 0 || deck.length === 0 ? (
        <EmptyDesk />
      ) : (
        <>
          {/*
            The hero: the week's reports as the design's connected deck — one
            card in focus with its neighbours peeking out either side, every
            card a way into its own report. The flag names the slot above it.
          */}
          <section className="block" aria-label="প্রধান প্রতিবেদন">
            <div className="block-head">
              <Flag label="সপ্তাহের সেরা" />
            </div>
            <CalendlyCarousel items={deck} autoPlayInterval={7000} pauseOnHover />
          </section>

          {/* The desk's own recommendations, under the slider. No "more" link:
              no single collection stands behind this band. */}
          <section className="block" aria-label="প্রস্তাবিত প্রতিবেদন">
            <BlockHead flag="প্রস্তাবিত" />
            <div className="recommended">
              {feature && <FeatureCard item={feature} />}
              <div className="recommended-rows">
                {rail.map(
                  (item, index) => item && <MiniRow key={`${item.slug}-${index}`} item={item} />,
                )}
              </div>
            </div>
          </section>

          {/* The newest reports, as the design's full-width thumbnail rows. The
              empty-query search page is this band's archive, so it gets the link. */}
          <section className="block" aria-label="সর্বশেষ প্রতিবেদন">
            <BlockHead flag="সর্বশেষ খবর" moreHref="/search/" />
            {latest.map(
              (item, index) => item && <MiniRow key={`${item.slug}-${index}`} item={item} large />,
            )}
          </section>

          <section className="block" aria-label="পাঠকের পছন্দ">
            <BlockHead flag="পাঠকের পছন্দ" />
            <StoryCarousel label="পাঠকের পছন্দ">
              {readersChoice.map(
                (item, index) =>
                  item && <CarouselCard key={`${item.slug}-${index}`} item={item} />,
              )}
            </StoryCarousel>
          </section>

          {/*
            The second carousel sits on a tinted band, so the two carousels stop
            reading as one repeated shape: পাঠকের পছন্দ on the page ground,
            মাসের সেরা on its own ground. The overflow suite probes both
            carousels as its render signal, so the band varies the chrome —
            never the carousel itself.
          */}
          <section className="block band-tint" aria-label="মাসের সেরা">
            <BlockHead flag="মাসের সেরা" />
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
