"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";

import type { FlippsItem } from "@/components/flipps/flipps-data";
import { ShareStory } from "@/components/dashboard/share-story";
import { StoryArt } from "@/components/dashboard/story-card";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { bn } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The scrim a headline reads against. It is darkest under the text, faint in the middle so the
 * picture is still the point, and darkens again at the top so the section chip keeps its contrast
 * against a bright sky.
 */
const SCRIM =
  "linear-gradient(to top, rgba(0,0,0,.94) 0%, rgba(0,0,0,.78) 18%, rgba(0,0,0,.46) 42%, rgba(0,0,0,.12) 64%, rgba(0,0,0,.42) 100%)";

/**
 * One reel is one screen tall, minus the chrome the shell has already drawn: the 4rem sticky
 * header, main's top padding, and — on phones only — the 7rem the phone dock reserves so the
 * last card is never sitting under it.
 *
 * This is the height of the whole column, not of the track: the counter and its progress bar sit
 * above the track and take their own height out of the same budget, so the arithmetic stays in
 * one place instead of being split across two nested boxes.
 *
 * `svh` and not `dvh`: a snap container whose height changes as the browser's own bars slide in
 * and out re-lays-out every reel mid-flick, and the reader lands between two cards.
 */
const REEL_COLUMN_HEIGHT =
  "h-[calc(100svh-12rem)] sm:h-[calc(100svh-12.5rem)] md:h-[calc(100svh-7rem)]";

/**
 * The dateline every surface of a reel shares: the writer, how long ago, and — on the surfaces
 * that have the room — the dateline itself.
 *
 * A `span`, not a `p`: the sheet hands this to Radix's description, which is already a paragraph,
 * and a paragraph inside a paragraph is not markup the parser will keep.
 */
function Dateline({
  item,
  className,
  showDate = false,
}: {
  item: FlippsItem;
  className?: string;
  showDate?: boolean;
}) {
  return (
    <span className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <span>{item.byline}</span>
      <i className="not-italic opacity-60" aria-hidden>
        •
      </i>
      <time dateTime={item.publishedAt ?? undefined}>{item.when}</time>
      {showDate && item.date && (
        <>
          <i className="not-italic opacity-60" aria-hidden>
            •
          </i>
          <span>{item.date}</span>
        </>
      )}
    </span>
  );
}

export function FlippsReels({ items }: { items: FlippsItem[] }) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const slides = React.useRef<(HTMLElement | null)[]>([]);
  const frame = React.useRef(0);
  const [active, setActive] = React.useState(0);
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  // The scroll observer is created once, so it reads the current reel through a ref rather than
  // through a stale closure over `active`.
  const activeRef = React.useRef(active);
  React.useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const current = items[Math.min(active, items.length - 1)] ?? null;
  const openItem = openIndex === null ? null : (items[openIndex] ?? null);

  const jump = React.useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const track = trackRef.current;
      const target = Math.max(0, Math.min(index, items.length - 1));
      const slide = slides.current[target];
      if (!track || !slide) return;
      // Measured from the slide itself, not from an index times the track's height: the cards are
      // separated by a gap, which a multiplication would fold into the wrong offset. The track is
      // the slides' offset parent (`relative`), so the number is already a scroll offset.
      track.scrollTo({ top: slide.offsetTop, behavior });
      setActive(target);
    },
    [items.length],
  );

  /**
   * Which reel is on screen. Native scroll-snap decides the resting position; this only has to
   * report it, and one rAF-throttled read per flick keeps a wheel or a swipe from re-rendering
   * the whole feed on every scroll event.
   */
  const onScroll = React.useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const track = trackRef.current;
      if (!track) return;
      let nearest = 0;
      let best = Number.POSITIVE_INFINITY;
      slides.current.forEach((slide, index) => {
        if (!slide) return;
        const distance = Math.abs(slide.offsetTop - track.scrollTop);
        if (distance < best) {
          best = distance;
          nearest = index;
        }
      });
      setActive((previous) => (previous === nearest ? previous : nearest));
    });
  }, []);

  React.useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  /**
   * A rotated phone or a window resize changes every reel's height at once, which leaves the
   * reader between two cards until it is settled. Re-align on the new size, without animating.
   */
  React.useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const slide = slides.current[activeRef.current];
      if (slide) track.scrollTop = slide.offsetTop;
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  function openDetail(index: number) {
    jump(index, "auto");
    setOpenIndex(index);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const key = event.key;
    if (key === "ArrowDown" || key === "PageDown") jump(activeRef.current + 1);
    else if (key === "ArrowUp" || key === "PageUp") jump(activeRef.current - 1);
    else if (key === "Home") jump(0);
    else if (key === "End") jump(items.length - 1);
    else return;
    event.preventDefault();
  }

  const progress = ((active + 1) / items.length) * 100;

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-6">
      <section
        aria-label="সংবাদের ফ্লিপস"
        className={cn("flex min-w-0 flex-col gap-2.5", REEL_COLUMN_HEIGHT)}
      >
        <div className="flex shrink-0 items-center gap-3">
          {/* The shell's own heading is desktop-only, so phones get the page's name here. */}
          <p className="text-base font-bold md:hidden">ফ্লিপস</p>
          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
            {bn(active + 1)} / {bn(items.length)}
          </span>
          <span
            aria-hidden
            className="h-1 flex-1 overflow-hidden rounded-full bg-secondary"
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </span>
          <span className="hidden gap-1 lg:flex">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7 rounded-full"
              disabled={active === 0}
              onClick={() => jump(active - 1)}
              aria-label="আগের ফ্লিপ"
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7 rounded-full"
              disabled={active === items.length - 1}
              onClick={() => jump(active + 1)}
              aria-label="পরের ফ্লিপ"
            >
              <ChevronDown className="size-4" />
            </Button>
          </span>
        </div>

        {/*
          tabIndex makes the track itself the keyboard's target, so the arrow keys step one reel
          instead of scrolling the document. no-scrollbar: a reel feed reads as a deck of cards,
          and the counter above already says where the reader is.
        */}
        <div
          ref={trackRef}
          tabIndex={0}
          role="group"
          aria-label="ফ্লিপ স্থানান্তর করুন"
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          className="relative flex min-h-0 flex-1 snap-y snap-mandatory flex-col gap-2.5 overflow-x-hidden overflow-y-auto overscroll-y-contain no-scrollbar scroll-smooth focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:scroll-auto"
        >
          {items.map((item, index) => (
            <article
              key={item.slug}
              ref={(node) => {
                slides.current[index] = node;
              }}
              aria-current={index === active ? "true" : undefined}
              onClick={() => {
                if (index !== active) {
                  jump(index);
                  return;
                }
                // The active card is already open beside itself on a wide screen; on a phone it
                // lifts the detail sheet, so a tap anywhere on the reel does something.
                if (!window.matchMedia("(min-width: 1024px)").matches) setOpenIndex(index);
              }}
              className="group relative h-full w-full shrink-0 snap-start snap-always cursor-pointer"
            >
              <div className="relative size-full overflow-hidden rounded-xl border border-border bg-foreground">
                <div
                  className={cn(
                    "absolute inset-0 transition-[transform,filter] duration-700 ease-out motion-reduce:transition-none",
                    index === active
                      ? "scale-100"
                      : "scale-[1.04] brightness-[.78] saturate-[.9] group-hover:scale-[1.07]",
                  )}
                >
                  <StoryArt
                    slug={item.sectionSlug}
                    imageUrl={item.image}
                    title={item.title}
                    priority={index === 0}
                    className="absolute inset-0 size-full"
                  />
                </div>
                <div aria-hidden className="absolute inset-0" style={{ backgroundImage: SCRIM }} />

                <div className="absolute inset-0 flex flex-col justify-between p-4 text-white">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[10px] font-bold tracking-[0.06em]">
                      {item.section}
                    </span>
                    <span className="text-[10.5px] font-semibold tabular-nums text-white/60">
                      {bn(index + 1)} / {bn(items.length)}
                    </span>
                  </div>

                  <div>
                    <h2 className="line-clamp-3 text-[19px] leading-[1.25] font-bold sm:text-xl">
                      {item.title}
                    </h2>
                    <Dateline item={item} className="mt-2 text-[11px] text-white/75" />
                    <div className="mt-3.5">
                      {/* Desktop reads in the pane beside the reel; a phone opens the sheet. */}
                      <Link
                        href={item.href}
                        onClick={(event) => event.stopPropagation()}
                        className="hidden items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-foreground transition-transform duration-200 hover:-translate-y-px lg:inline-flex"
                      >
                        পড়ুন
                        <ArrowRight className="size-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDetail(index);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-foreground transition-transform duration-200 active:scale-95 lg:hidden"
                      >
                        বিস্তারিত
                        <ArrowRight className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Desktop: the reel beside its own detail pane, the way the design splits the screen. */}
      <section aria-label="ফ্লিপের বিস্তারিত" className="hidden min-w-0 lg:block">
        {current && <FlippsDetail item={current} />}
      </section>

      {/* Phones: the same detail, raised from the bottom over the reel. */}
      <Sheet
        open={openItem !== null}
        onOpenChange={(open) => {
          if (!open) setOpenIndex(null);
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[85svh] overflow-y-auto rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          {openItem && (
            <>
              <SheetHeader className="gap-2 text-left">
                <p className="text-[11px] font-bold tracking-[0.06em] text-primary">
                  {openItem.section}
                </p>
                <SheetTitle className="text-xl leading-snug">{openItem.title}</SheetTitle>
                <SheetDescription>
                  <Dateline item={openItem} showDate />
                </SheetDescription>
              </SheetHeader>
              <p className="mt-5 text-[15px] leading-8 text-foreground/90">{openItem.excerpt}</p>
              <div className="mt-6 flex items-center gap-3">
                <Button asChild className="rounded-full">
                  <Link href={openItem.href}>
                    সম্পূর্ণ প্রতিবেদন পড়ুন
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
                <ShareStory href={openItem.href} label={openItem.title} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** The pane beside the reel column on a wide screen. */
function FlippsDetail({ item }: { item: FlippsItem }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="border border-border bg-secondary px-2.5 py-1 text-[10px] font-bold tracking-[0.06em] text-secondary-foreground">
          {item.section}
        </span>
        <ShareStory href={item.href} label={item.title} />
      </div>
      <h2 className="text-[clamp(21px,2vw,28px)] leading-[1.2] font-bold">{item.title}</h2>
      <Dateline item={item} showDate className="text-xs text-muted-foreground" />
      <p className="text-[15px] leading-8 text-muted-foreground">{item.excerpt}</p>
      <Button asChild className="mt-1 w-fit rounded-full">
        <Link href={item.href}>
          সম্পূর্ণ প্রতিবেদন পড়ুন
          <ArrowRight className="ml-1 size-4" />
        </Link>
      </Button>
      <p className="mt-1 text-[11px] text-muted-foreground">
        উপরে-নিচের তীর চিহ্ন বা পাশের বোতাম দিয়ে অন্য ফ্লিপে যান।
      </p>
    </article>
  );
}
