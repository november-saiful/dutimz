/**
 * Phase 6 SEO — structured data (JSON-LD) generators.
 * Returns valid schema.org objects for Organization, WebSite, BreadcrumbList, and Article.
 */
import { SITE } from "@/lib/constants/app";

/** Organization schema — used on homepage and footer. */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    name: "DUTIMZ",
    alternateName: "ঢাকা ইউনিভার্সিটি টাইম্‌জ",
    url: SITE.url,
    logo: `${SITE.url}/dutimz-logo.svg`,
    description: SITE.description,
    sameAs: [
      "https://facebook.com/dutimz",
      "https://twitter.com/dutimz",
      "https://youtube.com/dutimz",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "editorial",
      availableLanguage: ["Bengali", "English"],
    },
    foundingDate: "2026",
    areaServed: {
      "@type": "Country",
      name: "Bangladesh",
    },
  };
}

/** WebSite schema with SearchAction — used on homepage. */
export function webSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "DUTIMZ",
    alternateName: "ঢাকা ইউনিভার্সিটি টাইম্‌জ",
    url: SITE.url,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE.url}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** BreadcrumbList schema for article pages. */
export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** NewsArticle schema — extends the inline JSON-LD in detail pages. */
export function newsArticleSchema(opts: {
  title: string;
  description: string;
  url: string;
  image?: string;
  datePublished: string;
  dateModified: string;
  author?: string;
  category?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: opts.title,
    description: opts.description,
    mainEntityOfPage: opts.url,
    image: opts.image ? [opts.image] : undefined,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified,
    author: opts.author
      ? { "@type": "Person", name: opts.author }
      : undefined,
    publisher: {
      "@type": "Organization",
      name: "DUTIMZ",
      logo: { "@type": "ImageObject", url: `${SITE.url}/dutimz-logo.svg` },
    },
    inLanguage: ["bn", "en"],
    keywords: opts.category ? [opts.category] : undefined,
  };
}
