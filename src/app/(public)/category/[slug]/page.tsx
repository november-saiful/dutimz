export const runtime = "edge";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentGrid } from "@/components/content/ContentGrid";
import { SectionHeading } from "@/components/content/SectionHeading";
import { PopularList } from "@/components/content/PopularList";
import {
  getCategoryBySlug,
  getContentsByCategory,
  getPopularContents,
} from "@/lib/data/queries";
import { getLocaleServer } from "@/lib/i18n/server";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const category = await getCategoryBySlug(params.slug);
  if (!category) return { title: "Not found" };
  const title = `${category.name_en} — ${category.name_bn}`;
  return {
    title,
    description: category.description ?? undefined,
    alternates: { canonical: `/category/${category.slug}` },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: { slug: string };
}) {
  const category = await getCategoryBySlug(params.slug);
  if (!category) notFound();

  const [items, popular] = await Promise.all([
    getContentsByCategory(params.slug, 24),
    getPopularContents(5),
  ]);

  return (
    <div className="container mt-6">
      <SectionHeading title={category.name_bn} />
      {items.length === 0 ? (
        <p className="opacity-60">এই বিভাগে এখনো কোনো খবর নেই।</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ContentGrid items={items} priorityCount={1} />
          </div>
          <PopularList items={popular} />
        </div>
      )}
    </div>
  );
}
