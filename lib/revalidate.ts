import { revalidatePath } from "next/cache";

import { getRecentlyUpdatedArticles, getSitemapCategorySlugs } from "./stories";

/*
  The reading surfaces a desk write invalidates.

  These pages are cached (`export const revalidate` in app/page.tsx, app/news/[slug]/page.tsx and
  app/category/[slug]/page.tsx), which is what keeps a reader's request from paying for a full
  React render — and what stopped Cloudflare answering 503 `error code: 1102` ("Worker exceeded
  resource limits") to the front page and to every article. The price of that cache is that an
  approval has to say so, or the approved story waits out the page's own revalidate window.

  Dynamic segments are named by their pattern (`/news/[slug]`) rather than by a slug, because the
  desk is invalidating the route, not one of its pages: the story an approval affects is known to
  the database, not to whoever pressed the button, and a section page whose listing changed has
  no single story to name either.

  `/sitemap.xml` and `/statistics/` are here for the same reason at a smaller scale: a published
  story changes both, and neither is rendered per request any more. Measured on a local Worker,
  the pages come back `MISS` on their next request and are cached again after it; the sitemap does
  not — a metadata route is not refreshed by this call — so its own window is what reloads it and
  a change reaches crawlers within a minute rather than at once.
*/
const READING_SURFACES: { path: string; type?: "layout" | "page" }[] = [
  { path: "/", type: "page" },
  { path: "/news/[slug]", type: "page" },
  { path: "/category/[slug]", type: "page" },
  { path: "/statistics/", type: "page" },
  // A metadata route, so it is invalidated as a path rather than as a page.
  { path: "/sitemap.xml" },
];

/**
 * Invalidate every cached reading surface, and report what was invalidated.
 *
 * The report is the point of returning anything at all: the release check and the desk both need
 * to be able to see that the call reached the cache, since an invalidation with no tag cache
 * behind it is accepted and does nothing (see open-next.config.ts).
 */
export function revalidateReadingSurfaces(): string[] {
  for (const { path, type } of READING_SURFACES) {
    if (type) revalidatePath(path, type);
    else revalidatePath(path);
  }
  return READING_SURFACES.map(({ path }) => path);
}

/*
  The pages to render after an invalidation, named concretely.

  `revalidatePath` above marks a route, not a URL: `/news/[slug]` is every article. Rendering is
  per URL, so the refresher needs the URLs that exist, which the database knows and the route
  pattern does not.

  The list is deliberately not "every article". Re-rendering the whole archive after one approval
  would be the unbounded render rate this design exists to remove, and an old story's cached page
  is not wrong — it changes only when someone edits it, and that goes through the desk as well.
  So the list follows the edits, not the calendar: the most recently *updated* stories are the
  ones an approval can have changed, whichever point of the archive they sit at. Ordering by
  publication instead would refresh the newest stories over and over and leave an edited old one
  to be rendered for its next reader.

  The section pages and the sitemap are cheap and included either way; the front page is the one
  every reader sees first.
*/
const ARTICLES_TO_REFRESH = 12;

export async function readingPagesToRefresh(
  options: { includeArticles?: boolean } = {},
): Promise<string[]> {
  const paths = ["/", "/statistics/", "/sitemap.xml"];
  const [categories, articles] = await Promise.all([
    getSitemapCategorySlugs(),
    options.includeArticles === false
      ? Promise.resolve([])
      : getRecentlyUpdatedArticles(ARTICLES_TO_REFRESH),
  ]);
  for (const slug of categories) paths.push(`/category/${slug}/`);
  for (const { slug } of articles) paths.push(`/news/${slug}/`);
  return paths;
}
