/**
 * One row of the command palette's "প্রতিবেদন" group.
 *
 * Deliberately slim: the palette only needs enough to label a result and to
 * navigate to it, so the search endpoint never ships article bodies, author
 * ids or media keys to the browser.
 */
export type SearchHit = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  categorySlug: string;
  publishedAt: string | null;
};

export type SearchResponse = {
  /** True when the results are the bundled preview stories, not the archive. */
  demo: boolean;
  /** True when the archive could not be searched; never includes provider details. */
  unavailable?: boolean;
  results: SearchHit[];
};
