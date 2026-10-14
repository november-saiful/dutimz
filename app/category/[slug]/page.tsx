import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { MiniRow, storyItemFromStory } from "@/components/dashboard/story-blocks";
import { CATEGORIES, CATEGORY_NAMES } from "@/lib/site";
import { getCategoryStories } from "@/lib/stories";

/*
  Cached, and invalidated when the desk changes what readers see in this section.

  A newly approved story has to appear in its section at once, which is why this rendered per
  request — and rendering every section on every request is what put these pages over the
  Worker's resource limit (Cloudflare 503, error 1102). The desk's approvals and edits now
  invalidate the cached pages instead, so the section is refreshed by the change rather than by
  the reader's request. The window bounds how stale it can get if an invalidation never arrives.
*/
export const revalidate = 60;

/**
 * A dynamic segment with nothing to prerender is rendered per request and never stored, whatever
 * `revalidate` says, so every section is named here. The list is the site's own configuration
 * rather than a query: unlike articles, the sections are known without the database, and a section
 * that exists in the database but not here still renders on demand (`dynamicParams` defaults to
 * true) and is cached from then on.
 */
export function generateStaticParams(): { slug: string }[] {
  return CATEGORIES.filter((category) => category.slug !== "all").map((category) => ({
    slug: category.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { title } = await getCategoryStories(slug);
  const label = CATEGORY_NAMES[slug] ?? title;
  return {
    title: label,
    description: `ঢাকা বিশ্ববিদ্যালয়ের ${label} বিভাগের সর্বশেষ খবর।`,
    alternates: { canonical: `/category/${slug}/` },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // The university desk merged into campus: its old address lives on as a
  // redirect rather than an empty section.
  if (slug === "university") permanentRedirect("/category/campus/");
  const { title, description, stories } = await getCategoryStories(slug);
  const label = CATEGORY_NAMES[slug] ?? title;
  const items = stories.map(storyItemFromStory);

  return (
    <DutimzShell title={label} crumbs={[{ label: "বিভাগ" }, { label }]}>
      <p className="max-w-2xl text-sm text-muted-foreground">
        {description || `ঢাকা বিশ্ববিদ্যালয়ের ${label} বিভাগের খবর।`}
      </p>
      {items.length ? (
        <section aria-label={`${label} প্রতিবেদন`}>
          {items.map((item, index) => (
            <MiniRow key={`${item.slug}-${index}`} item={item} large />
          ))}
        </section>
      ) : (
        <div className="py-12 text-center">
          <strong className="text-lg">এই বিভাগে এখনো প্রতিবেদন নেই</strong>
          <p className="mt-2 text-sm text-muted-foreground">
            সম্পাদকীয় ডেস্কের যাচাই করা খবর এখানে দেখানো হবে।
          </p>
        </div>
      )}
    </DutimzShell>
  );
}
