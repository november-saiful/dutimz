export const runtime = "edge";

/**
 * Phase 6 SEO — auto-generated sitemap.xml via Next.js route handler.
 * Includes all public pages, published articles, and category pages.
 */
import type { MetadataRoute } from "next";
import { SITE } from "@/lib/constants/app";

const BASE_URL = SITE.url;

async function getPublishedSlugs(): Promise<{ slug: string; type: string; date: string }[]> {
  try {
    // Try Supabase first
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const { createSupabaseServerClient } = await import("@/lib/supabase/server");
      const supabase = createSupabaseServerClient();
      const { data } = await supabase
        .from("contents")
        .select("slug, content_type, published_at, updated_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(5000);
      if (data) {
        return data.map((c) => ({
          slug: c.slug,
          type: c.content_type,
          date: c.updated_at ?? c.published_at ?? new Date().toISOString(),
        }));
      }
    }
  } catch {
    // Fall through to mock
  }

  // Mock fallback
  const { mockContents } = await import("@/lib/data/mock");
  return mockContents
    .filter((c) => c.status === "published")
    .map((c) => ({
      slug: c.slug,
      type: c.content_type,
      date: c.updated_at,
    }));
}

async function getCategorySlugs(): Promise<string[]> {
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const { createSupabaseServerClient } = await import("@/lib/supabase/server");
      const supabase = createSupabaseServerClient();
      const { data } = await supabase
        .from("categories")
        .select("slug")
        .eq("is_active", true);
      if (data) return data.map((c) => c.slug);
    }
  } catch { /* fall through */ }

  const { mockCategories } = await import("@/lib/data/mock");
  return mockCategories.map((c) => c.slug);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, categories] = await Promise.all([
    getPublishedSlugs(),
    getCategorySlugs(),
  ]);

  const TYPE_ROUTES: Record<string, string> = {
    news: "/news",
    article: "/articles",
    documentary: "/documentaries",
  };

  const now = new Date().toISOString();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/search`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/bookmarks`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
  ];

  // Category pages
  const categoryPages: MetadataRoute.Sitemap = categories.map((slug) => ({
    url: `${BASE_URL}/category/${slug}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  // Article pages
  const articlePages: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${BASE_URL}${TYPE_ROUTES[a.type] ?? "/news"}/${a.slug}`,
    lastModified: a.date,
    changeFrequency: "weekly" as const,
    priority: a.type === "news" ? 0.9 : 0.8,
  }));

  return [...staticPages, ...categoryPages, ...articlePages];
}
