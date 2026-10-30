import type { MetadataRoute } from "next";

import { CATEGORIES, SITE_URL } from "@/lib/site";
import { getSitemapArticles, getSitemapCategorySlugs } from "@/lib/stories";

/*
  Cached like the reading surfaces it lists, and invalidated when the desk changes them.

  A sitemap is only useful while it matches what the site serves, so it cannot be frozen into the
  build either: the desk publishes throughout the day, and a crawler that finds a story missing
  from the sitemap stops looking for it. The desk's approval invalidates this route along with the
  pages (lib/revalidate.ts), and the schedule is the backstop — so a story appears here with the
  deploy that carried it, immediately after the approval that published it, or within five
  minutes of either.

  Ten minutes, not one: the scheduled refresh (lib/cache-refresh.ts, every five minutes) and the
  desk are what reload this document, and it changes a few times a day. One minute meant a
  regeneration of the whole sitemap every minute for nothing (see open-next.config.ts).
*/
export const revalidate = 600;

// Nothing reader-specific is advertised here: /account/, /auth/ and /api/ are disallowed in
// app/robots.ts, and /saved/ and /profile/me/ are per-reader views with no canonical of their
// own. Every path below is a page whose own alternates.canonical is exactly this shape.
const STATIC_PAGES: {
  path: string;
  changeFrequency: "daily" | "weekly" | "monthly";
  priority: number;
}[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/flipps/", changeFrequency: "daily", priority: 0.6 },
  { path: "/statistics/", changeFrequency: "weekly", priority: 0.6 },
  { path: "/about/", changeFrequency: "monthly", priority: 0.5 },
  { path: "/guidelines/", changeFrequency: "monthly", priority: 0.5 },
  { path: "/privacy/", changeFrequency: "monthly", priority: 0.4 },
  { path: "/terms/", changeFrequency: "monthly", priority: 0.4 },
  { path: "/corrections/", changeFrequency: "weekly", priority: 0.5 },
  { path: "/search/", changeFrequency: "monthly", priority: 0.3 },
];

const absolute = (path: string) => `${SITE_URL}${path}`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, liveCategories] = await Promise.all([
    getSitemapArticles(),
    getSitemapCategorySlugs(),
  ]);

  // The database is the source of truth for which sections are live; the configured list is
  // the fallback for demo mode and for a database that answered with nothing.
  const sections =
    liveCategories.length > 0
      ? liveCategories
      : CATEGORIES.filter((category) => category.slug !== "all").map(
          (category) => category.slug,
        );

  return [
    ...STATIC_PAGES.map((page) => ({
      url: absolute(page.path),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    ...sections.map((slug) => ({
      url: absolute(`/category/${slug}/`),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...articles.map((article) => ({
      url: absolute(`/news/${article.slug}/`),
      lastModified: new Date(article.updated_at ?? article.published_at),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
