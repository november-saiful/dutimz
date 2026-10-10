import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { StoryCard } from "@/components/dashboard/story-card";
import { Card, CardContent } from "@/components/ui/card";
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

  return (
    <DutimzShell
      title={label}
      crumbs={[{ label: "বিভাগ" }, { label }]}
    >
      <p className="max-w-2xl text-sm text-muted-foreground">
        {description || `ঢাকা বিশ্ববিদ্যালয়ের ${label} বিভাগের খবর।`}
      </p>
      {stories.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-lg font-bold">
              ঢা
            </span>
            <strong>এই বিভাগে এখনো প্রতিবেদন নেই</strong>
            <p className="text-sm text-muted-foreground">
              সম্পাদকীয় ডেস্কের যাচাই করা খবর এখানে দেখানো হবে।
            </p>
          </CardContent>
        </Card>
      )}
    </DutimzShell>
  );
}
