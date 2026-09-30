"use client";

import Link from "next/link";
import * as React from "react";

import { HaloReel, type HaloReelItem } from "@/components/ruixen/halo-reel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * One card of the reel. Just enough to draw it and to name it in the label —
 * the reel only needs a slug, a headline, a section and (optionally) art.
 */
export type ReelStory = {
  slug: string;
  title: string;
  category: string;
  imageUrl?: string | null;
};

export function HaloReelSection({ stories }: { stories: ReelStory[] }) {
  const [active, setActive] = React.useState(0);

  // The props come from a server component, so their identity is stable for the
  // life of the page: the ring is rebuilt only when the stories really change.
  const items = React.useMemo<HaloReelItem[]>(
    () =>
      stories.map((story) =>
        story.imageUrl
          ? {
              src: story.imageUrl,
              alt: story.title,
              title: story.title,
              subtitle: story.category,
            }
          : {
              // No hero art: the card shows its section instead of a broken or
              // borrowed image.
              title: story.category,
              subtitle: "DUTIMZ",
              alt: story.title,
            },
      ),
    [stories],
  );

  if (!stories.length) return null;

  const shown = stories[active] ?? stories[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>ঘুরে দেখুন সাম্প্রতিক প্রতিবেদন</CardTitle>
        <CardDescription>
          ডেস্কের সদ্য প্রকাশিত খবরগুলো একটি রিলে সাজানো — চক্রটি নিজে ঘোরে,
          কার্সর রাখলে থামে, চাইলে টেনে বা তীর চিহ্নে ঘোরানো যায়। সামনের
          প্রতিবেদনের শিরোনাম মাঝখানে দেখা যায়।
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-xl border bg-muted/40">
          <HaloReel
            items={items}
            onActiveChange={setActive}
            aria-label="সাম্প্রতিক প্রতিবেদনের রিল"
            className="h-[320px] sm:h-[380px] lg:h-[440px]"
            holdDuration={2600}
            stepDuration={800}
            maxCards={24}
            centerLabel={
              <div className="flex max-w-md flex-col items-center gap-2 text-center sm:items-start sm:text-left">
                <Badge variant="secondary">{shown.category}</Badge>
                <p className="text-balance text-lg font-semibold leading-snug sm:text-xl lg:text-2xl">
                  {shown.title}
                </p>
                <span className="text-xs text-muted-foreground">
                  সাম্প্রতিক প্রতিবেদন
                </span>
              </div>
            }
          />
        </div>
        {/*
          The reel's own label sits behind the cards and swallows no clicks, so
          the way through to the story the label is naming is a real link here.
        */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{shown.title}</p>
            <p className="text-xs text-muted-foreground">{shown.category}</p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/news/${shown.slug}/`}>প্রতিবেদনটি পড়ুন →</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
