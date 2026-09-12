export const runtime = "edge";

/**
 * Phase 6 SEO — auto-generated robots.txt via Next.js route handler.
 * Allows crawling of public pages, blocks admin/reporter/moderator desks.
 */
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/reporter", "/moderator", "/profile", "/bookmarks", "/api/"],
      },
    ],
    sitemap: "https://dutimz.com/sitemap.xml",
  };
}
