"use client";

import { useCallback, useMemo, useState } from "react";
import { HaloReel, type HaloReelItem } from "@/components/ui/halo-reel";
import type { ContentWithRelations } from "@/types";

/**
 * Hero news carousel (Halo Reel): featured stories orbit an ellipse pinned
 * to the left edge; the current story's headline sits in the space the ring
 * leaves on the right. Drag / arrow keys / autoplay all work; each card
 * links to its story. Bengali-only.
 */

function hrefFor(item: ContentWithRelations): string {
  return item.content_type === "news"
    ? `/news/${item.slug}`
    : item.content_type === "article"
      ? `/articles/${item.slug}`
      : `/documentaries/${item.slug}`;
}

export function HeroHaloReel({ items }: { items: ContentWithRelations[] }) {
  const [activeIdx, setActiveIdx] = useState(0);

  const onActiveChange = useCallback((idx: number) => setActiveIdx(idx), []);

  const reelItems = useMemo<HaloReelItem[]>(
    () =>
      items.map((content) => ({
        src: content.thumbnail_url ?? undefined,
        alt: content.thumbnail_alt ?? content.title_bn,
        href: hrefFor(content),
        title: content.title_bn,
        subtitle: content.category?.name_bn ?? undefined,
        description: content.excerpt_bn ?? undefined,
      })),
    [items],
  );

  if (items.length === 0) return null;

  const active = items[activeIdx] ?? items[0]!;
  return (
    <section aria-label="বৈশিষ্ট্য সংবাদ" className="container mt-6">
      <HaloReel
        items={reelItems}
        aria-label="বৈশিষ্ট্য সংবাদ"
        cardWidth={150}
        cardHeight={210}
        minScale={0.35}
        radiusXRatio={0.42}
        radiusYRatio={0.34}
        holdDuration={2200}
        stepDuration={800}
        onActiveChange={onActiveChange}
        className="h-[420px] w-full rounded-glass border border-neutral-200 bg-white/30 backdrop-blur-glass dark:border-neutral-800 dark:bg-black/20 md:h-[480px]"
        centerLabel={
          <a
            href={hrefFor(active)}
            className="flex flex-col gap-3 max-w-xs md:max-w-sm group/link focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl -m-2 p-2 transition-opacity hover:opacity-90 pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* শিরোনাম */}
            <h2 className="text-xl font-bold leading-snug md:text-3xl group-hover/link:underline decoration-1 underline-offset-4">
              {active.title_bn}
            </h2>
            {/* সারসংক্ষেপ */}
            {active.excerpt_bn ? (
              <p className="text-sm leading-relaxed opacity-70 line-clamp-3 hidden sm:block">
                {active.excerpt_bn}
              </p>
            ) : null}
          </a>
        }
      />
    </section>
  );
}
