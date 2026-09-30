"use client";

/*
 * A connected carousel: one card in focus, the neighbours peeking out of either
 * side of it, a progress-driven dot per card and a slow auto-advance.
 *
 * The registry source ships three hand-tuned geometries — a phone layout, a
 * tablet layout and a desktop one — which are three different *arrangements* of
 * the same content: on a phone the card is a tall column with the picture under
 * the type, on a desktop it is a wide row with the picture beside it. Here the
 * ring is drawn once, in the desktop design's own units, and scaled by the room
 * the page actually gives it (`available / RING_WIDTH`). A phone therefore shows
 * the desktop deck reduced — type included — rather than a rearrangement of it,
 * and everything the deck *does* (auto-advance, hover to hold, the dots, the
 * arrow keys, clicking a neighbour) is untouched.
 *
 * Three consequences of scaling instead of re-laying out:
 *
 *  - A card is 762×513 in design units, so on a phone the pull quote and the
 *    byline chips would print under 12px. Below `DETAIL_MIN_SCALE` a card keeps
 *    only the headline and the picture;
 *  - the ring stays invisible until the page has measured itself, so a phone
 *    never shows a few hundred milliseconds of the deck at desktop scale. The box
 *    is reserved in CSS (`aspect-ratio`), so nothing below it moves when the deck
 *    appears. With JavaScript disabled that box stays empty;
 *  - the dots scale with the ring but keep a 24px tall hit area, alongside swipe
 *    navigation for phone readers.
 *
 * The remaining adaptations are unchanged: the accessible names are Bengali like
 * every other label on the site, `prefers-reduced-motion` stops the auto-advance
 * and the spring (an auto-rotating deck with no way to stop it is what WCAG 2.2.2
 * forbids), an empty deck renders nothing instead of indexing into it, and the
 * headline and pull quote are clamped to three lines because a real report
 * headline is longer than the registry demo's marketing copy.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";

import Image from "next/image";

import { motion } from "framer-motion";

import type { HTMLAttributes, MouseEvent, KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

export interface CarouselItem {
  id: string | number;
  stat: string;
  quote: string;
  author: string;
  role: string;
  defaultImage: string;
  selectedImage: string;
  alt?: string;
}

export interface CalendlyCarouselProps extends HTMLAttributes<HTMLDivElement> {
  items: CarouselItem[];
  autoPlayInterval?: number;
  pauseOnHover?: boolean;
}

const VISIBLE_OFFSETS = [-4, -3, -2, -1, 0, 1, 2, 3, 4] as const;

/**
 * The ring in design units: the card in focus, two neighbours on either side of
 * it, the rest parked off the ring. These are the registry's *desktop* numbers,
 * so at a scale of 1 this draws exactly the desktop deck, and at 0.35 it draws
 * exactly the same deck at 35%.
 */
const RING_WIDTH = 1012;
const RING_HEIGHT = 513;

/** The scale at which the pull quote (18px in the design) still reaches 12px. */
const DETAIL_MIN_SCALE = 12 / 18;

const TRANSITION_SPRING = {
  type: "spring",
  stiffness: 220,
  damping: 26,
  mass: 0.75,
} as const;

/** The reduced-motion stand-in: jump to the next position instead of springing. */
const TRANSITION_NONE = { duration: 0 } as const;

/**
 * Where a slot sits relative to the centre of the ring, in design units. Each
 * card is anchored as `left: 50%; top: 50%` plus these numbers, so they are
 * measurements from the ring's middle, not from its corner.
 */
function ringSlot(offset: number) {
  if (offset === 0) {
    return {
      x: -381,
      y: -256.5,
      width: 762,
      height: 513,
      opacity: 1,
      zIndex: 0,
      pointerEvents: "auto" as const,
    };
  }

  if (Math.abs(offset) === 1) {
    return {
      x: offset < 0 ? -506 : 401,
      y: -172,
      width: 105,
      height: 344,
      opacity: 1,
      zIndex: 100,
      pointerEvents: "auto" as const,
    };
  }

  if (Math.abs(offset) === 2) {
    return {
      x: offset < 0 ? -596 : 522,
      y: -102.5,
      width: 74,
      height: 205,
      opacity: 1,
      zIndex: 100,
      pointerEvents: "auto" as const,
    };
  }

  // Off the ring: parked past the neighbours, outside the box the ring is drawn in.
  return {
    x: offset < 0 ? -860 : 860,
    y: -102.5,
    width: 74,
    height: 205,
    opacity: 0,
    zIndex: 0,
    pointerEvents: "none" as const,
  };
}

export function CalendlyCarousel({
  items,
  autoPlayInterval = 6000,
  pauseOnHover = false,
  className,
  ...props
}: CalendlyCarouselProps) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const elapsedRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // State
  const [page, setPage] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);
  // null until the page has measured the room it was given: the ring is drawn at
  // 1:1 in the server's HTML and re-scaled on the first pass on the client.
  const [ringWidth, setRingWidth] = useState<number | null>(null);

  // Global State/Hooks
  const total = items.length;
  const activeIndex = ((page % total) + total) % total;
  const scale = (ringWidth ?? RING_WIDTH) / RING_WIDTH;
  const measured = ringWidth !== null;
  // On a phone the card is a fifth of its design size, so its smaller type would
  // print too small to read and the card keeps the headline and the picture only.
  const showDetail = scale >= DETAIL_MIN_SCALE;

  useEffect(() => {
    // Measured from the deck's own box rather than the window: the sidebar takes
    // a bite out of the page on tablet and desktop widths, and the deck is told to
    // scale to what is left, not to the screen.
    const element = containerRef.current;
    if (!element) return;

    const measure = () => setRingWidth(Math.min(element.clientWidth, RING_WIDTH));

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(query.matches);

    sync();
    query.addEventListener("change", sync);

    return () => {
      query.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (total < 2) {
      elapsedRef.current = 0;
      lastTimeRef.current = null;
      setProgress(0);
      return;
    }
    if (reduceMotion || (pauseOnHover && isHovered)) {
      lastTimeRef.current = null;
      return;
    }

    const step = (timestamp: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }

      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      elapsedRef.current += delta;

      if (elapsedRef.current >= autoPlayInterval) {
        elapsedRef.current = 0;
        lastTimeRef.current = null;
        setProgress(0);
        setPage((curr) => curr + 1);
        return;
      }

      setProgress(Math.min((elapsedRef.current / autoPlayInterval) * 100, 100));
      animationFrameRef.current = requestAnimationFrame(step);
    };

    animationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      lastTimeRef.current = null;
    };
  }, [page, pauseOnHover, isHovered, autoPlayInterval, reduceMotion, total]);

  // Handlers
  const handlePrev = useCallback(() => {
    if (total < 2) return;
    elapsedRef.current = 0;
    lastTimeRef.current = null;
    setProgress(0);
    setPage((curr) => curr - 1);
  }, [total]);

  const handleNext = useCallback(() => {
    if (total < 2) return;
    elapsedRef.current = 0;
    lastTimeRef.current = null;
    setProgress(0);
    setPage((curr) => curr + 1);
  }, [total]);

  const handleSelectTab = (event: MouseEvent<HTMLButtonElement>) => {
    const indexStr = event.currentTarget.dataset.index;

    if (indexStr !== undefined) {
      const targetIdx = Number.parseInt(indexStr, 10);
      let diff = targetIdx - activeIndex;

      if (diff > total / 2) {
        diff -= total;
      } else if (diff < -total / 2) {
        diff += total;
      }

      elapsedRef.current = 0;
      lastTimeRef.current = null;
      setProgress(0);
      setPage((curr) => curr + diff);
    }
  };

  const handleSelectCard = (event: MouseEvent<HTMLDivElement>) => {
    const offsetStr = event.currentTarget.dataset.offset;

    if (offsetStr !== undefined) {
      const offset = Number.parseInt(offsetStr, 10);

      if (offset !== 0) {
        elapsedRef.current = 0;
        lastTimeRef.current = null;
        setProgress(0);
        setPage((curr) => curr + offset);
      }
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      handlePrev();
    } else if (event.key === "ArrowRight") {
      handleNext();
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || event.changedTouches.length !== 1 || event.touches.length !== 0) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const threshold = Math.max(36, Math.min(72, (ringWidth ?? RING_WIDTH) * 0.12));

    // Ignore taps and vertical page scrolling; only a deliberate horizontal
    // gesture that dominates its vertical movement advances the deck.
    if (Math.abs(deltaX) < threshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    if (deltaX < 0) handleNext();
    else handlePrev();
  };

  // Every hook above runs on every render, so an empty deck can leave early.
  // Without this the ring would index into `items[NaN]` and take the page down.
  if (!total) return null;

  const spring = reduceMotion ? TRANSITION_NONE : TRANSITION_SPRING;

  // The dots: the pill scales with the ring, the hit area does not.
  const dotPill = Math.max(6, 8 * scale);
  const dotWidth = Math.max(40, 80 * scale);
  const dotHit = Math.max(24, dotPill);
  // The row gives back the padding the hit area adds, so the visible gap under the
  // ring stays the one the design asks for (20px at full scale).
  const dotRowTop = Math.max(8, 20 * scale - (dotHit - dotPill) / 2);
  const dotGap = Math.max(4, 6 * scale);
  const dotRadius = Math.max(2, 3 * scale);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="সাম্প্রতিক প্রতিবেদনের ক্যারোসেল"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchStartRef.current = null;
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative w-full max-w-[1240px] mx-auto flex flex-col items-center select-none outline-none py-4 overflow-hidden",
        className,
      )}
      {...props}
    >
      <div
        id="carousel-view-panel"
        role="tabpanel"
        aria-live="polite"
        className="relative w-full flex items-center justify-center"
      >
        {/*
          The box the ring is drawn in. Its size is pure CSS — the design's aspect
          ratio capped at the design's width — so the space the deck needs is
          reserved in the server's HTML and nothing below it moves when the ring
          appears.
        */}
        <div
          className="relative"
          style={{
            width: `min(100%, ${RING_WIDTH}px)`,
            aspectRatio: `${RING_WIDTH} / ${RING_HEIGHT}`,
          }}
        >
          {/* The design itself, at 1:1, scaled to fill that box exactly. */}
          <div
            className="absolute top-0 left-0"
            style={{
              width: RING_WIDTH,
              height: RING_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              opacity: measured ? 1 : 0,
            }}
          >
            {VISIBLE_OFFSETS.map((offset) => {
              // With a single story, rendering the neighbour slots wraps the
              // same card around the focused card. Keep only the real focus.
              if (total === 1 && offset !== 0) return null;
              const virtualIndex = page + offset;
              const itemIndex = ((virtualIndex % total) + total) % total;
              const item = items[itemIndex];
              const isActive = offset === 0;

              return (
                <motion.div
                  key={virtualIndex}
                  data-offset={offset}
                  onClick={handleSelectCard}
                  initial={false}
                  animate={ringSlot(offset)}
                  transition={spring}
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    willChange: "transform",
                  }}
                  className={cn(
                    "rounded-[32px] bg-card text-card-foreground shadow-[0_10px_30px_rgba(95,109,119,0.08),0_4px_12px_rgba(95,109,119,0.06)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.6),0_4px_12px_rgba(0,0,0,0.4)] overflow-visible",
                    !isActive && "cursor-pointer",
                  )}
                >
                  {offset === -1 && (
                    <div
                      aria-hidden="true"
                      className="absolute top-0 bottom-0 flex items-center text-card pointer-events-none z-[100]"
                      style={{
                        width: 22,
                        height: 42,
                        margin: "auto 0",
                        left: "calc(100% - 1px)",
                      }}
                    >
                      <svg
                        viewBox="0 0 20 37.3338"
                        preserveAspectRatio="none"
                        className="size-full fill-current overflow-visible block"
                      >
                        <path d="M0 0C0 0 1.2422 13.5759 10 13.5759C18.7578 13.5759 20 0 20 0V37.3338C20 37.3338 18.7578 23.7578 10 23.7578C1.2422 23.7578 0 37.3338 0 37.3338V0Z" />
                      </svg>
                    </div>
                  )}

                  {offset === 1 && (
                    <div
                      aria-hidden="true"
                      className="absolute top-0 bottom-0 flex items-center text-card pointer-events-none z-[100]"
                      style={{
                        width: 22,
                        height: 42,
                        margin: "auto 0",
                        right: "calc(100% - 1px)",
                      }}
                    >
                      <svg
                        viewBox="0 0 20 37.3338"
                        preserveAspectRatio="none"
                        className="size-full fill-current overflow-visible block"
                      >
                        <path d="M0 0C0 0 1.2422 13.5759 10 13.5759C18.7578 13.5759 20 0 20 0V37.3338C20 37.3338 18.7578 23.7578 10 23.7578C1.2422 23.7578 0 37.3338 0 37.3338V0Z" />
                      </svg>
                    </div>
                  )}

                  {offset === -2 && (
                    <div
                      aria-hidden="true"
                      className="absolute top-0 bottom-0 flex items-center text-card pointer-events-none z-[100]"
                      style={{
                        width: 18,
                        height: 28,
                        margin: "auto 0",
                        left: "calc(100% - 1px)",
                      }}
                    >
                      <svg
                        viewBox="0 0 16 28"
                        preserveAspectRatio="none"
                        className="size-full fill-current overflow-visible block"
                      >
                        <path d="M0 0C0 0 0.993759 10.1818 8 10.1818C15.0062 10.1818 16 0 16 0V28C16 28 15.0062 17.8182 8 17.8182C0.993759 17.8182 0 28 0 28V0Z" />
                      </svg>
                    </div>
                  )}

                  {offset === 2 && (
                    <div
                      aria-hidden="true"
                      className="absolute top-0 bottom-0 flex items-center text-card pointer-events-none z-[100]"
                      style={{
                        width: 18,
                        height: 28,
                        margin: "auto 0",
                        right: "calc(100% - 1px)",
                      }}
                    >
                      <svg
                        viewBox="0 0 16 28"
                        preserveAspectRatio="none"
                        className="size-full fill-current overflow-visible block"
                      >
                        <path d="M0 0C0 0 0.993759 10.1818 8 10.1818C15.0062 10.1818 16 0 16 0V28C16 28 15.0062 17.8182 8 17.8182C0.993759 17.8182 0 28 0 28V0Z" />
                      </svg>
                    </div>
                  )}

                  <div
                    className="size-full overflow-hidden relative"
                    style={{ borderRadius: "inherit" }}
                  >
                    <motion.div
                      initial={false}
                      animate={{ opacity: isActive ? 0 : 1 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      className={cn(
                        "absolute inset-0 p-2",
                        isActive && "pointer-events-none",
                      )}
                    >
                      <div className="size-full rounded-[24px] overflow-hidden bg-muted relative">
                        <Image
                          alt={item.alt || item.author}
                          src={item.defaultImage}
                          fill
                          unoptimized
                          draggable={false}
                          style={{ objectFit: "cover" }}
                          className="size-full object-cover"
                        />
                      </div>
                    </motion.div>

                    <div
                      className="absolute"
                      style={{
                        left: "50%",
                        top: "50%",
                        width: 762,
                        height: 513,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      {/* The desktop composition, unchanged at every width. */}
                      <motion.div
                        initial={false}
                        animate={{
                          opacity: isActive ? 1 : 0,
                          x: isActive ? 0 : offset < 0 ? -822 : 822,
                        }}
                        transition={spring}
                        className={cn(
                          "size-full flex flex-row p-7 gap-6",
                          !isActive && "pointer-events-none",
                        )}
                      >
                        <div className="flex-1 min-w-0 flex flex-col items-start text-left justify-between py-1 gap-3">
                          <h3
                            title={item.stat}
                            className="text-4xl font-bold tracking-tight text-foreground leading-tight w-full line-clamp-3 break-words"
                          >
                            {item.stat}
                          </h3>

                          {showDetail && (
                            <>
                              <div className="relative w-full min-w-0 my-auto py-1">
                                <span
                                  aria-hidden="true"
                                  className="font-serif text-4xl text-foreground/40 absolute right-full top-0 pr-1 select-none pointer-events-none inline"
                                >
                                  “
                                </span>

                                <p className="font-serif text-lg text-foreground/85 leading-snug line-clamp-3 break-words">
                                  “{item.quote}”
                                </p>
                              </div>

                              <div className="flex min-w-0 w-full max-w-full overflow-hidden items-start justify-start">
                                <div className="flex flex-col items-start min-w-0 max-w-full">
                                  <span className="w-fit inline-flex items-center justify-center rounded-[4px] font-medium py-1 px-2.5 text-xs bg-secondary text-secondary-foreground shrink-0 select-none">
                                    <span className="whitespace-nowrap font-semibold">
                                      {item.author}
                                    </span>
                                  </span>

                                  <div className="shrink-0 flex items-center justify-start px-3 h-[6px] -my-[1px] text-secondary relative z-10">
                                    <svg
                                      className="block shrink-0 fill-current overflow-visible"
                                      preserveAspectRatio="none"
                                      viewBox="0 -2 14 12"
                                      width="14"
                                      height="10"
                                    >
                                      <path d="M0 -2 V0 C0 0 5.09091 0.49688 5.09091 4 C5.09091 7.50312 0 8 0 8 V10 H14 V8 C14 8 8.90909 7.50312 8.90909 4 C8.90909 0.49688 14 0 14 0 V-2 Z" />
                                    </svg>
                                  </div>

                                  <span className="w-fit inline-flex items-center justify-center rounded-[4px] font-medium py-1 px-2.5 text-xs bg-secondary text-muted-foreground max-w-full select-none">
                                    <span title={item.role} className="truncate">
                                      {item.role}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="relative shrink-0 overflow-hidden rounded-[22px] bg-muted w-[clamp(180px,44%,330px)] h-full">
                          <Image
                            alt={item.alt || item.author}
                            src={item.selectedImage}
                            fill
                            unoptimized
                            draggable={false}
                            style={{ objectFit: "cover" }}
                            className="size-full object-cover"
                          />
                        </div>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="প্রতিবেদন নির্বাচন"
        className="flex items-center"
        style={{ gap: dotGap, marginTop: dotRowTop }}
      >
        {items.map((item, idx) => {
          const isSelected = idx === activeIndex;

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              data-index={idx}
              id={`carousel-tab-${idx}`}
              aria-controls="carousel-view-panel"
              onClick={handleSelectTab}
              aria-selected={isSelected}
              aria-label={item.stat}
              tabIndex={isSelected ? 0 : -1}
              className="flex items-center justify-center border-0 p-0 bg-transparent cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                height: dotHit,
                // The hit area grows upward and downward out of the pill, so the
                // row keeps its proportions while a thumb still finds the dot.
                paddingBlock: (dotHit - dotPill) / 2,
              }}
            >
              <span
                className={cn(
                  "block overflow-hidden transition-[width] duration-300 ease-out",
                  isSelected
                    ? "bg-secondary"
                    : "bg-secondary hover:bg-muted-foreground/30",
                )}
                style={{
                  height: dotPill,
                  width: isSelected ? dotWidth : dotPill,
                  borderRadius: dotRadius,
                }}
              >
                {isSelected && (
                  <span
                    className="block h-full bg-blue-600 dark:bg-blue-500"
                    style={{
                      borderRadius: dotRadius,
                      transformOrigin: "0% 50%",
                      transform: `scaleX(${progress / 100})`,
                    }}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
