import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  mediaUrlFor,
  relativeTimeBn,
  slugArtClass,
  type PreviewStoryLike,
} from "@/components/dashboard/story-helpers";
import { one, storyCategory, storyCredit, type Story } from "@/lib/supabase";

export function StoryArt({
  slug,
  imageUrl,
  title,
  className = "",
  sizes = "(max-width: 768px) 100vw, 400px",
  priority = false,
}: {
  slug: string;
  imageUrl?: string | null;
  title: string;
  className?: string;
  /**
   * The width the picture is drawn at, for the browser's srcset choice. A card
   * keeps the default; a full-bleed frame asks for the whole viewport.
   */
  sizes?: string;
  /** Set on the one picture that is above the fold; everything else stays lazy. */
  priority?: boolean;
}) {
  if (imageUrl) {
    return (
      // `flex`, not Tailwind's `block`: this site's own `.block` is the page
      // container (1240px wide, centred, with the gutter as padding), and a
      // class attribute can only answer to both. A full-bleed surface — the
      // hero slider — was therefore capped at the page measure with the plate
      // showing either side of it. The wrapper's only child is the absolutely
      // positioned picture, so the display mode decides nothing but that.
      <span className={`relative flex overflow-hidden ${className}`}>
        <Image
          src={imageUrl}
          alt={title}
          fill
          sizes={sizes}
          className="object-cover"
          priority={priority}
          loading={priority ? undefined : "lazy"}
        />
      </span>
    );
  }
  return (
    <span
      className={`story-art-fallback relative flex items-center justify-center overflow-hidden ${className}`}
      aria-hidden
    >
      <span className={`story-art-fallback ${slugArtClass(slug)} absolute inset-0`} />
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary-foreground/20 text-xl font-bold text-primary-foreground">
        ঢা
      </span>
    </span>
  );
}

export function StoryCard({ story }: { story: Story }) {
  const category = storyCategory(story);
  const credit = storyCredit(story);
  const url = `/news/${encodeURIComponent(story.slug)}/`;
  return (
    <Card className="overflow-hidden">
      <Link href={url} aria-label={`পড়ুন: ${story.title}`}>
        <StoryArt
          slug={category.slug}
          imageUrl={
            story.hero_media_key ? mediaUrlFor(story.hero_media_key) : null
          }
          title={story.title}
          className="aspect-video w-full"
        />
      </Link>
      <CardContent className="flex flex-col gap-2 pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href={`/category/${category.slug}`}
            className="font-medium text-primary hover:underline"
          >
            {category.title_bn}
          </Link>
          <span aria-hidden>·</span>
          <RelativeTime
            value={story.published_at}
            fallback={relativeTimeBn(story.published_at)}
          />
        </div>
        <h3 className="text-base font-semibold leading-snug">
          <Link href={url} className="hover:underline">
            {story.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {story.excerpt}
        </p>
        <div className="text-xs text-muted-foreground">
          {credit.href ? (
            <Link href={credit.href} className="hover:underline">
              {credit.name}
            </Link>
          ) : (
            <span>{credit.name}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function PreviewStoryCard({
  story,
  rank,
}: {
  story: PreviewStoryLike;
  rank?: number;
}) {
  const url = `/news/${story.slug}/`;
  return (
    <Card className="overflow-hidden">
      <Link href={url} aria-label={`পড়ুন: ${story.title}`}>
        <StoryArt
          slug={story.categorySlug}
          imageUrl={story.imageUrl}
          title={story.title}
          className="aspect-video w-full"
        />
      </Link>
      <CardContent className="flex flex-col gap-2 pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {typeof rank === "number" && (
            <Badge variant="secondary">{rank}</Badge>
          )}
          <span className="font-medium text-primary">{story.category}</span>
          <span aria-hidden>·</span>
          <time>{story.time}</time>
        </div>
        <h3 className="text-base font-semibold leading-snug">
          <Link href={url} className="hover:underline">
            {story.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {story.excerpt}
        </p>
        <div className="text-xs text-muted-foreground">{story.author}</div>
      </CardContent>
    </Card>
  );
}

export function RecommendedItem({ story }: { story: Story }) {
  const category = storyCategory(story);
  const url = `/news/${encodeURIComponent(story.slug)}/`;
  const profile = one(story.profiles);
  void profile;
  return (
    <article className="flex items-center gap-3 border-b py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{category.title_bn}</span>
          <span aria-hidden>·</span>
          <RelativeTime
            value={story.published_at}
            fallback={relativeTimeBn(story.published_at)}
          />
        </div>
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">
          <Link href={url} className="hover:underline">
            {story.title}
          </Link>
        </h3>
      </div>
      <Link
        href={url}
        aria-label={`পড়ুন: ${story.title}`}
        className="shrink-0"
      >
        <StoryArt
          slug={category.slug}
          imageUrl={
            story.hero_media_key ? mediaUrlFor(story.hero_media_key) : null
          }
          title={story.title}
          className="h-16 w-20 rounded-md"
        />
      </Link>
    </article>
  );
}
