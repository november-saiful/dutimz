"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";

import { Carousel, CarouselIndicator } from "@/components/application/carousel/carousel-base";

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

      <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
        <CarouselIndicator framed />
      </div>

      <Carousel.Content className="gap-2">
        {images.map((image) => (
          <Carousel.Item key={image.src} className="relative overflow-hidden rounded-xl">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="object-cover"
            />
          </Carousel.Item>
        ))}
      </Carousel.Content>
    </Carousel.Root>
  );
}
