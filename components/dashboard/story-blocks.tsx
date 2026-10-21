import Link from "next/link";

import { Flag } from "@/components/dashboard/flag";
import { StoryArt } from "@/components/dashboard/story-card";
import type { CarouselItem } from "@/components/ui/connected-carousel";
import { interviewSectionLabel, mediaUrlFor, relativeTimeBn } from "@/lib/site";
import type { PreviewStory } from "@/lib/stories";
import { storyCategory, storyCredit, type Story } from "@/lib/supabase";

/**
 * One story as the design's cards want it: the fields every surface shows,
 * flattened once. Real archive stories and the demo-mode preview fixture both
 * land here, so the front page, the section pages and the article rail all
 * render the same shapes over the same data.
 */
export type StoryItem = {
  slug: string;
  title: string;
  excerpt: string;
  section: string;
  sectionSlug: string;
  /** The interview desk's second step (ভার্চুয়াল / ইন-পার্সন), else null. */
  interviewSection: string | null;
  byline: string;
  bylineHref: string;
  when: string;
  publishedAt: string | null;
  image: string | null;
};

export function storyItemFromStory(story: Story): StoryItem {
  const category = storyCategory(story);
  const credit = storyCredit(story);
  return {
    slug: story.slug,
    title: story.title,
    excerpt: story.excerpt,
    section: category.title_bn,
    sectionSlug: category.slug,
    interviewSection:
      category.slug === "interview"
        ? interviewSectionLabel(story.interview_kind ?? null)
        : null,
    byline: credit.name,
    bylineHref: credit.href,
    when: relativeTimeBn(story.published_at),
    publishedAt: story.published_at,
    image: story.hero_media_key ? mediaUrlFor(story.hero_media_key) : null,
  };
}

export function storyItemFromPreview(story: PreviewStory): StoryItem {
  return {
    slug: story.slug,
    title: story.title,
    excerpt: story.excerpt,
    section: story.category,
    sectionSlug: story.categorySlug,
    interviewSection: null,
    byline: story.author,
    bylineHref: "",
    when: story.time,
    publishedAt: null,
    image: story.imageUrl ?? null,
  };
}

export function storyUrl(item: StoryItem): string {
  return `/news/${encodeURIComponent(item.slug)}/`;
}

/**
 * One story as the lead deck's card wants it: the design's own fields, filled
 * from the same flattened story every other card on the page reads.
 */
export function deckItemFromStory(item: StoryItem): CarouselItem {
  return {
    id: item.slug,
    stat: item.title,
    quote: item.excerpt,
    category: item.section,
    author: item.byline,
    role: item.when,
    href: storyUrl(item),
    image: item.image,
    sectionSlug: item.sectionSlug,
  };
}

/**
 * The shared byline row every card carries: section • time. The section wears
 * the design's link colour but is not a link of its own — the whole card is
 * one link to the story, and links inside links are not valid HTML.
 */
export function StoryMeta({ item }: { item: StoryItem }) {
  return (
    <span className="meta">
      <span className="ml">{item.section}</span>
      <i aria-hidden>•</i>
      <time dateTime={item.publishedAt ?? undefined}>{item.when}</time>
    </span>
  );
}

/** The design's hashtag row. Tags are the story's own desk — nothing invented. */
export function StoryTags({ item }: { item: StoryItem }) {
  return (
    <div className="tags">
      <span>#{item.section}</span>
      {item.interviewSection && <span>#{item.interviewSection}</span>}
    </div>
  );
}

/** The thumbnail row (a `mini`) used in the rails: text left, picture right. */
export function MiniRow({ item, large = false }: { item: StoryItem; large?: boolean }) {
  return (
    <Link href={storyUrl(item)} className={`mini${large ? " lg" : ""}`}>
      <span className="min-w-0">
        <StoryMeta item={item} />
        <h4 className={large ? "clamp2" : "clamp3"}>{item.title}</h4>
      </span>
      <StoryArt
        slug={item.sectionSlug}
        imageUrl={item.image}
        title={item.title}
        className={`thumb${large ? " lg" : ""}`}
      />
    </Link>
  );
}

/** One card in a story carousel: media, byline, clamped title, tags. */
export function CarouselCard({ item }: { item: StoryItem }) {
  return (
    <Link href={storyUrl(item)} className="card">
      <StoryArt
        slug={item.sectionSlug}
        imageUrl={item.image}
        title={item.title}
        className="card-media"
      />
      <StoryMeta item={item} />
      <h4 className="clamp3">{item.title}</h4>
      <StoryTags item={item} />
    </Link>
  );
}

/** The overlaid feature card at the top of the recommended rail. */
export function FeatureCard({ item }: { item: StoryItem }) {
  return (
    <Link href={storyUrl(item)} className="feature">
      <span className="art">
        <StoryArt
          slug={item.sectionSlug}
          imageUrl={item.image}
          title={item.title}
          className="h-full w-full"
        />
      </span>
      <span className="ov" aria-hidden />
      <span className="ft">
        <StoryMeta item={item} />
        <h4 className="clamp2">{item.title}</h4>
      </span>
    </Link>
  );
}

/**
 * The design's section header: a flag label and, only when a real collection
 * stands behind the band, a "view more" link. A band with no destination
 * renders no link rather than pointing at a page that is not its archive.
 */
export function BlockHead({
  flag,
  moreHref,
  moreLabel = "সব দেখুন",
}: {
  flag: string;
  moreHref?: string;
  moreLabel?: string;
}) {
  return (
    <div className="block-head">
      <Flag label={flag} />
      {moreHref && (
        <Link href={moreHref} className="more">
          {moreLabel}
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      )}
    </div>
  );
}

/**
 * The slot filler for a design that shows more cards than an archive may hold:
 * a short feed cycles through its own stories (as the reference mock does)
 * instead of leaving holes or inventing rows.
 */
export function pick<T>(items: T[], index: number): T | null {
  if (items.length === 0) return null;
  return items[index] ?? items[index % items.length];
}
