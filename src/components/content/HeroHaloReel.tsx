"use client";

import { useCallback, useMemo, useState } from "react";
import { HaloReel, type HaloReelItem } from "@/components/ui/halo-reel";
import type { ContentWithRelations } from "@/types";
import { useLocaleStore } from "@/stores/locale";
import { translate } from "@/lib/i18n/dictionary";

/**
 * Hero news carousel (Halo Reel): featured stories orbit an ellipse pinned
 * to the left edge; the current story's headline sits in the space the ring
 * leaves on the right. Drag / arrow keys / autoplay all work; each card
 * links to its story.
 */

function hrefFor(item: ContentWithRelations): string {
  return item.content_type === "news"
    ? `/news/${item.slug}`
    : item.content_type === "article"
      ? `/articles/${item.slug}`
      : `/documentaries/${item.slug}`;
}

export function HeroHaloReel({ items }: { items: ContentWithRelations[] }) {
  const locale = useLocaleStore((s) => s.locale);
  const isBn = locale === "bn";
  const [activeIdx, setActiveIdx] = useState(0);

  const onActiveChange = useCallback((idx: number) => setActiveIdx(idx), []);

  const reelItems = useMemo<HaloReelItem[]>(
    () =>
      items.map((content) => ({
        src: content.thumbnail_url ?? undefined,
        alt:
          content.thumbnail_alt ??
          (isBn ? content.title_bn : (content.title_en ?? content.title_bn)),
        href: hrefFor(content),
        // Stories without a thumbnail get a text face card instead.
        title: isBn ? content.title_bn : (content.title_en ?? content.title_bn),
        subtitle:
          locale === "bn"
            ? (content.category?.name_bn ?? undefined)
            : (content.category?.name_en ?? undefined),
        description: isBn
          ? (content.excerpt_bn ?? undefined)
          : (content.excerpt_en ?? content.excerpt_bn ?? undefined),
      })),
    [items, isBn, locale],
  );

  if (items.length === 0) return null;

  const heading = translate(locale, "hero.featured");
  const active = items[activeIdx] ?? items[0]!;
  const activeTitle = isBn ? active.title_bn : (active.title_en ?? active.title_bn);
  const activeExcerpt = isBn
    ? (active.excerpt_bn ?? undefined)
    : (active.excerpt_en ?? active.excerpt_bn ?? undefined);
  const activeCategory = isBn
    ? (active.category?.name_bn ?? undefined)
    : (active.category?.name_en ?? undefined);
  const activeType = active.content_type;

  return (
    <section aria-label={heading} className="container mt-6">
      <HaloReel
        items={reelItems}
        aria-label={heading}
        cardWidth={150}
        cardHeight={210}
        minScale={0.35}
        radiusXRatio={0.42}
        radiusYRatio={0.34}
        holdDuration={2200}
        stepDuration={800}
        onActiveChange={onActiveChange}
        className="h-[420px] w-full rounded-glass border border-white/30 bg-white/30 backdrop-blur-glass dark:bg-black/20 md:h-[480px]"
        centerLabel={
          <div className="flex flex-col gap-3 max-w-xs md:max-w-sm">
            {/* Category + type badge */}
            <div className="flex items-center gap-2">
              <p
                className="inline-block rounded-full px-3 py-1 text-xs font-bold"
                style={{
                  background: "var(--md-sys-color-primary)",
                  color: "var(--md-sys-color-on-primary)",
                }}
              >
                {activeCategory ?? heading}
              </p>
              <span className="text-xs uppercase tracking-widest opacity-50">
                {activeType === "news"
                  ? (isBn ? "সংবাদ" : "News")
                  : activeType === "article"
                    ? (isBn ? "নিবন্ধ" : "Article")
                    : (isBn ? "প্রামাণ্যচিত্র" : "Documentary")}
              </span>
            </div>
            {/* Headline */}
            <h2 className="text-xl font-bold leading-snug md:text-3xl">
              {activeTitle}
            </h2>
            {/* Excerpt */}
            {activeExcerpt ? (
              <p className="text-sm leading-relaxed opacity-70 line-clamp-3 hidden sm:block">
                {activeExcerpt}
              </p>
            ) : null}
            {/* CTA */}
            <a
              href={hrefFor(active)}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold opacity-80 hover:opacity-100 transition-opacity"
            >
              {isBn ? "বিস্তারিত পড়ুন" : "Read more"}
              <span aria-hidden="true">→</span>
            </a>
          </div>
        }
      />
    </section>
  );
}
