import { HeroHaloReel } from "@/components/content/HeroHaloReel";
import { ContentGrid } from "@/components/content/ContentGrid";
import { SectionHeading } from "@/components/content/SectionHeading";
import { DocumentarySpotlight } from "@/components/content/DocumentarySpotlight";
import { PopularList } from "@/components/content/PopularList";
import { NewsletterCTA } from "@/components/content/NewsletterCTA";
import { translate } from "@/lib/i18n/dictionary";
import { getLocaleServer } from "@/lib/i18n/server";
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
  const locale = await getLocaleServer();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  const [featured, latest, popular, documentary, categories] = await Promise.all([
    getFeaturedContents(HOME_SECTIONS.heroCount),
    getLatestContents(24),
    getPopularContents(HOME_SECTIONS.popularCount),
    getDocumentarySpotlight(),
    getActiveCategories(),
  ]);

  const heroItems = featured.length > 0 ? featured : latest.slice(0, 3);
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
        <SectionHeading title={t("section.latest")} />
        <ContentGrid items={gridItems.slice(0, HOME_SECTIONS.latestCount)} locale={locale} priorityCount={1} />
      </section>

      {categorySections.map(({ category, items }) =>
        items.length === 0 ? null : (
          <section key={category.id} className="container mt-12">
            <SectionHeading
              title={locale === "bn" ? category.name_bn : category.name_en}
              action={
                <a href={`/category/${category.slug}`} className="text-sm font-medium opacity-70 hover:underline">
                  {t("content.readMore")} →
                </a>
              }
            />
            <ContentGrid items={items} locale={locale} />
          </section>
        ),
      )}

      <section className="container mt-12 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeading title={t("section.documentary")} />
          <DocumentarySpotlight content={documentary} locale={locale} />
        </div>
        <PopularList items={popular} locale={locale} />
      </section>

      <NewsletterCTA locale={locale} />
    </>
  );
}
