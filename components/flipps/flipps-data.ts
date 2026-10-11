import { formatDateBn, mediaUrlFor, relativeTimeBn } from "@/lib/site";
import { storyCategory, storyCredit, type Story } from "@/lib/supabase";
import type { PreviewStory } from "@/lib/stories";

/**
 * How many reports the deck carries. Long enough that the feed does not run out mid-read, short
 * enough that the page does not send the whole archive to draw a dozen cards.
 */
export const REEL_COUNT = 12;

/**
 * One reel: everything a card and its detail pane need, with the Bengali formatting already
 * resolved on the server.
 *
 * The client component that draws the reels never sees a Supabase row and never calls
 * `Date.now()`, so the markup it hydrates is the markup the server sent — a relative timestamp
 * resolved in the browser would have rendered "২ ঘণ্টা আগে" on one side of hydration and
 * "৩ ঘণ্টা আগে" on the other.
 */
export type FlippsItem = {
  slug: string;
  /** Where the story is read in full. */
  href: string;
  /** The reel's own address, which is what a reader shares: it opens the deck on this card. */
  reelHref: string;
  title: string;
  excerpt: string;
  section: string;
  sectionSlug: string;
  byline: string;
  /** How old the report is, in Bengali, or the demo fixture's own label. */
  when: string;
  /** The full dateline, for the surfaces that have room for it. */
  date: string | null;
  publishedAt: string | null;
  image: string | null;
};

export function flippsFromStory(story: Story): FlippsItem {
  const category = storyCategory(story);
  return {
    slug: story.slug,
    href: `/news/${encodeURIComponent(story.slug)}/`,
    reelHref: `/flipps/${encodeURIComponent(story.slug)}/`,
    title: story.title,
    excerpt: story.excerpt,
    section: category.title_bn,
    sectionSlug: category.slug,
    byline: storyCredit(story).name,
    when: relativeTimeBn(story.published_at),
    date: formatDateBn(story.published_at),
    publishedAt: story.published_at,
    image: story.hero_media_key ? mediaUrlFor(story.hero_media_key) : null,
  };
}

export function flippsFromPreview(story: PreviewStory): FlippsItem {
  return {
    slug: story.slug,
    href: `/news/${encodeURIComponent(story.slug)}/`,
    reelHref: `/flipps/${encodeURIComponent(story.slug)}/`,
    title: story.title,
    excerpt: story.excerpt,
    section: story.category,
    sectionSlug: story.categorySlug,
    byline: story.author,
    when: story.time,
    date: null,
    publishedAt: null,
    image: story.imageUrl ?? null,
  };
}
