import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The desk strip above the feed: every live section, in the editor's order,
 * with the front page first. It is navigation, not a client-side filter — a
 * pill loads that desk's own page, so the address, the cache and the back
 * button all agree about where the reader is.
 */
export function CategoryStrip({
  sections,
  active = "all",
}: {
  sections: { slug: string; label: string }[];
  active?: string;
}) {
  return (
    <nav className="cat-strip" aria-label="সংবাদ বিভাগ">
      {sections.map((section) => (
        <Link
          key={section.slug}
          href={section.slug === "all" ? "/" : `/category/${section.slug}/`}
          className={cn("cat-pill", section.slug === active && "is-active")}
          aria-current={section.slug === active ? "page" : undefined}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
