import { HeroHaloReel } from "@/components/content/HeroHaloReel";
import { ContentGrid } from "@/components/content/ContentGrid";
import { SectionHeading } from "@/components/content/SectionHeading";
import { DocumentarySpotlight } from "@/components/content/DocumentarySpotlight";
import { PopularList } from "@/components/content/PopularList";
import { NewsletterCTA } from "@/components/content/NewsletterCTA";
import { PollSection } from "@/components/content/PollSection";
import {
  getFeaturedContents,
  getLatestContents,
  getPopularContents,
  getDocumentarySpotlight,
  getActiveCategories,
  getContentsByCategory,
} from "@/lib/data/queries";
import { HOME_SECTIONS } from "@/lib/constants/app";
import type { ContentWithRelations } from "@/types";

export async function HomeSections() {
  const [featured, latest, popular, documentary, categories] = await Promise.all([
    getFeaturedContents(HOME_SECTIONS.heroCount),
    getLatestContents(24),
    getPopularContents(HOME_SECTIONS.popularCount),
    getDocumentarySpotlight(),
    getActiveCategories(),
  ]);

  // Pick 1 latest article per category for the hero reel
  const heroItems = categories
    .map((cat) => {
      const catLatest = latest.find((c) => c.category?.id === cat.id);
      return catLatest ?? null;
    })
    .filter(Boolean) as ContentWithRelations[];
  const gridItems: ContentWithRelations[] = latest.filter(
    (c) => !heroItems.some((h) => h.id === c.id),
  );

  const categorySections = await Promise.all(
    categories.slice(0, 4).map(async (cat) => ({
      category: cat,
      items: await getContentsByCategory(cat.slug, HOME_SECTIONS.categoryItemsCount),
    })),
  );

  return (
    <>
      <HeroHaloReel items={heroItems} />

      <section className="container mt-10">
        <SectionHeading title="সর্বশেষ সংবাদ" />
        <ContentGrid items={gridItems.slice(0, HOME_SECTIONS.latestCount)} priorityCount={1} />
      </section>

      {categorySections.map(({ category, items }) =>
        items.length === 0 ? null : (
          <section key={category.id} className="container mt-12">
            <SectionHeading
              title={category.name_bn}
              action={
                <a href={`/category/${category.slug}`} className="text-sm font-medium opacity-70 hover:underline">
                  আরও পড়ুন →
                </a>
              }
            />
            <ContentGrid items={items} />
          </section>
        ),
      )}

      <section className="container mt-12 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeading title="প্রামাণ্যচিত্র" />
          <DocumentarySpotlight content={documentary} />
        </div>
        <PopularList items={popular} />
      </section>

      <PollSection />

      <NewsletterCTA />
    </>
  );
}
