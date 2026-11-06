"use client";

import * as React from "react";
import Link from "next/link";

import { StoryArt } from "@/components/dashboard/story-card";
import { storyUrl, type StoryItem } from "@/components/dashboard/story-blocks";
import { cn } from "@/lib/utils";

/**
 * The front page's lead: one report at a time across the full width of the
 * screen, its picture under a gradient and the story's headline over it.
 *
 * The mockup's hero is a slide, not a grid: the headline over the picture, a
 * way into the report and the deck's dots at the bottom. The picture fills the
 * frame and the next slide crossfades in place, so a phone never scrolls
 * sideways to read the lead.
 *
 * Its rules are the site's: the deck stops for a reader who asked their system
 * for less motion, holds while the pointer or the keyboard is on it, and only
 * turns while it is on screen. A story with no picture wears `StoryArt`'s own
 * brand art rather than a blank plate.
 */

const AUTO_ADVANCE_MS = 7000;

export function HeroDeck({ items }: { items: StoryItem[] }) {
  const [index, setIndex] = React.useState(0);
  const [held, setHeld] = React.useState(false);
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const [inView, setInView] = React.useState(false);
  const frameRef = React.useRef<HTMLElement | null>(null);
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);

  const total = items.length;
  const active = total ? ((index % total) + total) % total : 0;

  const goTo = React.useCallback(
    (next: number) => setIndex(next),
    [],
  );
  const goBy = React.useCallback(
    (delta: number) => setIndex((current) => current + delta),
    [],
  );

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  React.useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (total < 2 || reduceMotion || held || !inView) return;
    const timer = window.setTimeout(() => goBy(1), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, goBy, held, inView, reduceMotion, total]);

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goBy(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goBy(1);
    }
  }

  function onTouchStart(event: React.TouchEvent<HTMLElement>) {
    if (event.touches.length !== 1) {
      touchStart.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: React.TouchEvent<HTMLElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 44 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
    goBy(deltaX < 0 ? 1 : -1);
  }

  if (!total) return null;

  return (
    <section
      ref={frameRef}
      className="hero-deck"
      // The phone's top bar measures this edge to know when the picture is
      // still under it and the bar should stay clear.
      data-hero-under-bar
      aria-roledescription="carousel"
      aria-label="প্রধান প্রতিবেদন"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        touchStart.current = null;
      }}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setHeld(false);
        }
      }}
    >
      {items.map((item, slide) => {
        const isActive = slide === active;
        return (
          <article
            key={item.slug}
            className={cn("hero-slide", isActive && "is-active")}
            aria-hidden={!isActive}
            inert={!isActive}
          >
            <StoryArt
              imageUrl={item.image}
              title={item.title}
              className="hero-art"
              sizes="100vw"
              priority={slide === 0}
            />
            <span className="hero-shade" aria-hidden />
            <div className="hero-body">
              <h2 className="hero-title clamp3">{item.title}</h2>
              <div className="hero-actions">
                <Link className="hero-read" href={storyUrl(item)}>
                  পড়ুন
                </Link>
                <div
                  className="hero-dots"
                  role="tablist"
                  aria-label="প্রতিবেদন নির্বাচন"
                >
                  {items.map((other, dot) => (
                    <button
                      key={other.slug}
                      type="button"
                      role="tab"
                      aria-selected={dot === active}
                      aria-label={other.title}
                      className={cn("hero-dot", dot === active && "is-active")}
                      onClick={() => goTo(dot)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
