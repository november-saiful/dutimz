"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";

import { Carousel, CarouselIndicator } from "@/components/application/carousel/carousel-base";
import { bn } from "@/lib/site";

export type GalleryImage = { src: string; alt: string };

/** An article's pictures, one at a time, with previous and next controls and a dot per picture. */
export function ArticleGallery({ images }: { images: GalleryImage[] }) {
  return (
    <Carousel.Root className="aspect-[4/3] w-full">
      <Carousel.PrevTrigger className="absolute top-1/2 left-4 z-10 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-background/90 p-2 text-foreground outline-current backdrop-blur-xs focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
        <ChevronLeft className="size-5" aria-hidden />
      </Carousel.PrevTrigger>
      <Carousel.NextTrigger className="absolute top-1/2 right-4 z-10 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-background/90 p-2 text-foreground outline-current backdrop-blur-xs focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
        <ChevronRight className="size-5" aria-hidden />
      </Carousel.NextTrigger>

      <div className="absolute top-4 right-4 z-10">
        <CarouselIndicator framed />
      </div>

      <Carousel.Content className="gap-2">
        {images.map((image, index) => (
          <Carousel.Item key={image.src} className="relative overflow-hidden rounded-xl">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="object-cover"
            />
            {/* The gallery's title and count live on the picture itself, in the corner a printed
                caption would sit, so the strip needs no heading of its own. A span, not a
                paragraph: `.article-body p` would repaint it as body copy. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-4 pt-12 pb-4 text-white">
              <span className="line-clamp-1 min-w-0 text-xs font-medium" aria-hidden>
                {image.alt}
              </span>
              <span className="shrink-0 rounded-full bg-black/45 px-2 py-0.5 text-[11px] tabular-nums">
                {bn(index + 1)}/{bn(images.length)}
              </span>
            </div>
          </Carousel.Item>
        ))}
      </Carousel.Content>
    </Carousel.Root>
  );
}
