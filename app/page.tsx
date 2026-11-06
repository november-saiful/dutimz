import Link from "next/link";

import { CategoryStrip } from "@/components/dashboard/category-strip";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { FeedCard } from "@/components/dashboard/feed-card";
import { Flag } from "@/components/dashboard/flag";
import { HeroDeck } from "@/components/dashboard/hero-deck";
import { StoryCarousel } from "@/components/dashboard/story-carousel";
import {
  BlockHead,
  CarouselCard,
  FeatureCard,
  MiniRow,
  pick,
  storyItemFromPreview,
  storyItemFromStory,
  type StoryItem,
} from "@/components/dashboard/story-blocks";
import { WebHome } from "@/components/dashboard/web-home";
import {
  getFeedVoteSummary,
  getFeedViewSummary,
  getLatestStories,
  getNavCategories,
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
  approval's invalidation never arrives. Regeneration is asked for explicitly — by the desk after
  it invalidates, and by the five-minute schedule on the media Worker — and never by the reader's
  own request, which is what the previous background queue did (open-next.config.ts).

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
  // One read serves the whole front page: the hero slides, the feed and the
  // bands below them all come from the same newest-first list.
  const stories = demo ? [] : await getLatestStories(25);
  const ids = stories.map((story) => story.id);
  const [votes, views] = await Promise.all([
    getFeedVoteSummary(ids),
    getFeedViewSummary(ids),
  ]);
  const items: StoryItem[] = demo
    ? previewStories.map(storyItemFromPreview)
    : stories.map((story) => {
        const item = storyItemFromStory(story);
        const split = votes.get(story.id);
        return {
          ...item,
          ...split,
          views: views.get(story.id) ?? 0,
        };
      });

  // The lead is the five newest reports; the feed prints the same newest-first
  // list under it, the way the mockup does — a story just published belongs in
  // both places, not only in the hero.
  const hero = [0, 1, 2, 3, 4]
    .map((slot) => pick(items, slot))
    .filter((item): item is StoryItem => item !== null);
  const feed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map((slot) => pick(items, slot))
    .filter((item): item is StoryItem => item !== null);
  // The editorial bands read on from slot 5, so the feed's stories are not
  // printed a third time.
  const feature = pick(items, 5);
  const rail = [6, 7, 8, 9].map((slot) => pick(items, slot));
  const readersChoice = [15, 16, 17, 18, 19].map((slot) => pick(items, slot));
  const bestOfMonth = [20, 21, 22, 23, 24].map((slot) => pick(items, slot));
  // The strip and the masthead read the same desks, so a retired section
  // leaves both surfaces at once.
  const sections = await getNavCategories();

  return (
    <DutimzShell bare heroGlass={hero.length > 0}>
      {items.length === 0 || hero.length === 0 ? (
        <EmptyDesk />
      ) : (
        <>
        <div className="home-view">
          <HeroDeck items={hero} />

          <div className="home-sheet">
            <div className="home-in">
              <CategoryStrip sections={sections} />

              <section className="home-band" aria-label="সর্বশেষ খবর">
                <div className="feed-head">
                  <h2>সর্বশেষ খবর</h2>
                  <Link href="/news/" className="more">
                    সব দেখুন
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </Link>
                </div>
                <div className="feed-grid">
                  {feed.map((item, index) => (
                    <FeedCard key={`${item.slug}-${index}`} item={item} />
                  ))}
                </div>
              </section>

              {/* The desk's own recommendations, under the feed. No "more"
                  link: no single collection stands behind this band. */}
              <section className="home-band" aria-label="প্রস্তাবিত প্রতিবেদন">
                <BlockHead flag="প্রস্তাবিত" />
                <div className="recommended">
                  {feature && <FeatureCard item={feature} />}
                  <div className="recommended-rows">
                    {rail.map(
                      (item, index) =>
                        item && <MiniRow key={`${item.slug}-${index}`} item={item} />,
                    )}
                  </div>
                </div>
              </section>

              <section className="home-band" aria-label="পাঠকের পছন্দ">
                <BlockHead flag="পাঠকের পছন্দ" />
                <StoryCarousel label="পাঠকের পছন্দ">
                  {readersChoice.map(
                    (item, index) =>
                      item && <CarouselCard key={`${item.slug}-${index}`} item={item} />,
                  )}
                </StoryCarousel>
              </section>

              <section className="home-band band-tint" aria-label="মাসের সেরা">
                <BlockHead flag="মাসের সেরা" />
                <StoryCarousel label="মাসের সেরা">
                  {bestOfMonth.map(
                    (item, index) =>
                      item && <CarouselCard key={`${item.slug}-${index}`} item={item} />,
                  )}
                </StoryCarousel>
              </section>
            </div>
          </div>
        </div>
        {/* Both editions ship in the cached HTML and the breakpoint picks one:
            a phone keeps the deck the earlier design was built around. */}
        <WebHome items={items} sections={sections} />
        </>
      )}
    </DutimzShell>
  );
}
