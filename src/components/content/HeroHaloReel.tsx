"use client";

import { useMemo } from "react";
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
      })),
    [items, isBn, locale],
  );

  if (items.length === 0) return null;

  const heading = translate(locale, "hero.featured");

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
        className="h-[420px] w-full rounded-glass border border-white/30 bg-white/30 backdrop-blur-glass dark:bg-black/20 md:h-[480px]"
        centerLabel={
          <div className="max-w-xs md:max-w-sm">
            <p
              className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-bold"
              style={{
                background: "var(--md-sys-color-primary)",
                color: "var(--md-sys-color-on-primary)",
              }}
            >
              {heading}
            </p>
            <p className="text-2xl font-bold leading-snug md:text-4xl">
              {isBn ? "সংবাদ, বিশ্লেষণ," : "News. Analysis."}
              <br />
              {isBn ? "প্রতিদিন।" : "Every day."}
            </p>
            <p className="mt-3 hidden text-sm opacity-70 md:block">
              {isBn
                ? "গল্পগুলো ঘুরিয়ে দেখুন — টেনে ঘোরানো যায়, কার্ডে ক্লিক করলে খুলবে।"
                : "Spin the ring — drag it, or tap a card to open the story."}
            </p>
          </div>
        }
      />
    </section>
  );
}
