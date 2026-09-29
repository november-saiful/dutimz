import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { StoryCard } from "@/components/dashboard/story-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CATEGORY_NAMES } from "@/lib/site";
import { getCategoryStories } from "@/lib/stories";

export const revalidate = 60;

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
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            DUTIMZ সংবাদ বিভাগ
          </p>
          <CardTitle className="text-3xl">{label}</CardTitle>
          <CardDescription>
            {description || `ঢাকা বিশ্ববিদ্যালয়ের ${label} বিভাগের খবর।`}
          </CardDescription>
        </CardHeader>
      </Card>
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
