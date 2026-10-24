import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import {
  REEL_COUNT,
  flippsFromPreview,
  flippsFromStory,
  type FlippsItem,
} from "@/components/flipps/flipps-data";
import { FlippsReels } from "@/components/flipps/flipps-reels";
import {
  getLatestStories,
  getStoryBySlug,
  isDemoMode,
  previewStories,
  shareImageFor,
} from "@/lib/stories";

// Per request, like the deck it opens onto: a shared link has to show the reel the paper has for
// that story now, not the one it had when this deployment was built.
export const dynamic = "force-dynamic";

type SharedReel = {
  item: FlippsItem;
  /** The picture the link previews with. */
  image: string;
};

/** The one reel a shared link names, or nothing when no published story claimed the slug. */
async function sharedReel(slug: string): Promise<SharedReel | null> {
  if (isDemoMode()) {
    const preview = previewStories.find((story) => story.slug === slug);
    return preview
      ? { item: flippsFromPreview(preview), image: preview.imageUrl ?? "/og-banner.png" }
      : null;
  }
  const story = await getStoryBySlug(slug);
  // A story the deck's window has already passed still has a reel, and its link has to keep
  // working: the slug is the address a reporter was handed when it was first published.
  return story
    ? { item: flippsFromStory(story), image: shareImageFor(story) }
    : null;
}

/**
 * The deck a shared link opens onto: the reel it was posted for, then the newest reports.
 *
 * The shared reel leads rather than sitting wherever the newest list happens to put it, and that
 * is what keeps the server and the browser in agreement. The card a reader lands on is the deck's
 * first, so nothing has to be scrolled into place once the browser takes over, and swiping on from
 * it continues into the newest reporting. Capped at the deck's own size, so a shared link costs no
 * more than the deck does.
 */
async function deckFor(slug: string, reel: FlippsItem): Promise<FlippsItem[]> {
  const rest = isDemoMode()
    ? previewStories.map(flippsFromPreview)
    : (await getLatestStories(REEL_COUNT)).map(flippsFromStory);
  return [reel, ...rest.filter((item) => item.slug !== slug)].slice(0, REEL_COUNT);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const shared = await sharedReel(slug);
  if (!shared) return { title: "ফ্লিপ পাওয়া যায়নি" };

  const url = `/flipps/${encodeURIComponent(slug)}/`;
  const title = `${shared.item.title} | DUTIMZ`;
  return {
    title: shared.item.title,
    description: shared.item.excerpt,
    alternates: { canonical: url },
    // A shared reel previews as the story it carries, on the same terms as its article: its own
    // headline, its own picture, its own description.
    openGraph: {
      type: "article",
      title,
      description: shared.item.excerpt,
      url,
      // No declared width and height, unlike the article. A reel's picture is the story's hero, and
      // a hero is as likely to be portrait as landscape; Facebook reads the file's own dimensions,
      // where a fixed 1200×630 would describe a portrait photograph as a landscape one.
      images: [{ url: shared.image, alt: shared.item.title }],
      ...(shared.item.publishedAt
        ? { publishedTime: shared.item.publishedAt }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: shared.item.excerpt,
      images: [shared.image],
    },
  };
}

export default async function SharedFlippsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shared = await sharedReel(slug);
  if (!shared) notFound();

  const items = await deckFor(slug, shared.item);

  return (
    // Like the deck: immersive below the dock breakpoint, the centered column at and above it.
    <DutimzShell bare mobileDeck>
      {/* Same as the feed: below the dock breakpoint the reel runs under the top bar and the dock,
          so the room both still take in flow is cancelled rather than left as paper strips. */}
      <div className="w-full min-w-0 max-[860px]:-mt-[var(--topbar)] max-[860px]:mb-[calc(-1*var(--dock))] min-[861px]:mx-auto min-[861px]:max-w-[var(--maxw)] min-[861px]:px-7 min-[861px]:py-3">
        <FlippsReels items={items} />
      </div>
    </DutimzShell>
  );
}
