import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Generated rather than kept in public/robots.txt so the advertised sitemap is built from the
// same SITE_URL the site itself uses: the previous static file went on advertising
// /sitemap-index.xml for weeks after the port dropped the Astro sitemap that produced it.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/account/", "/auth/", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
