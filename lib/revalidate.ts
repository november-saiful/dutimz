import { revalidatePath } from "next/cache";

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
