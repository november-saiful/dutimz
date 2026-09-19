import type { Category, ContentWithRelations } from "@/types";

/**
 * The hero feed ("বৈশিষ্ট্য সংবাদ" / Halo Reel).
 *
 * The hero is a ring, and a ring needs more than one card. Picking strictly
 * one story per category satisfies the editorial rule but collapses on a
 * young site: if every published story happens to sit in a single category
 * (or the other categories have nothing yet), the reel is handed a single
 * item and the whole section degrades to one static card — no orbit, no
 * autoplay, no way to reach the other stories.
 *
 * So the rule has two halves:
 *
 *   1. **One per category** — the editor's featured pick for that category if
 *      it has one, otherwise the category's newest story.
 *   2. **Top up to a floor** — while the ring is thinner than `minCount`,
 *      take the next newest stories from the pool, regardless of category.
 *      This only ever fires on a thin feed; when the categories can fill the
 *      ring on their own, nothing else is added and the one-per-category rule
 *      holds exactly.
 */

export interface HeroFeed {
  /** Active categories, in display order. */
  categories: Category[];
  /** Curated stories, newest first. */
  featured: ContentWithRelations[];
  /** Newest published stories, newest first. */
  latest: ContentWithRelations[];
}

export function buildHeroItems(
  feed: HeroFeed,
  minCount: number,
): ContentWithRelations[] {
  const picked: ContentWithRelations[] = [];
  const chosen = new Set<string>();

  for (const category of feed.categories) {
    const item =
      feed.featured.find((content) => content.category?.id === category.id) ??
      feed.latest.find((content) => content.category?.id === category.id);
    if (!item || chosen.has(item.id)) continue;
    picked.push(item);
    chosen.add(item.id);
  }

  if (picked.length >= minCount) return picked;

  // Recency first: the top-up is "the newest stories there are", and being a
  // second story from a category that already contributed is the point when
  // that category is the only one publishing.
  for (const item of [...feed.latest, ...feed.featured]) {
    if (picked.length >= minCount) break;
    if (chosen.has(item.id)) continue;
    picked.push(item);
    chosen.add(item.id);
  }

  return picked;
}
