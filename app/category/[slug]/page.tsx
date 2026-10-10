import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { MiniRow, storyItemFromStory } from "@/components/dashboard/story-blocks";
import { CATEGORY_NAMES } from "@/lib/site";
import { getCategoryStories } from "@/lib/stories";

// Rendered per request: a newly approved story has to appear in its section at once. A cached
// section page is only refreshed by a background regeneration, which is how stories stayed
// missing from their section for hours.
export const dynamic = "force-dynamic";

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
