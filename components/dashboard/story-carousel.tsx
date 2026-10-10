"use client";

import * as React from "react";

/**
 * The design's story carousel: a snap-scrolling rail with the paired prev/next
 * buttons underneath. The arrows move the rail by most of its own width, so
 * the reader always lands near a card boundary.
 */
export function StoryCarousel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const railRef = React.useRef<HTMLDivElement>(null);

  function move(direction: number) {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * rail.clientWidth * 0.8,
      behavior: "smooth",
    });
  }

  return (
    <div>
      <div className="carousel" ref={railRef} aria-label={label}>
        {children}
      </div>
      <div className="car-nav">
        <button
          type="button"
          className="car-btn"
          onClick={() => move(-1)}
          aria-label={`${label} — আগেরগুলো`}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>
        <button
          type="button"
          className="car-btn dark"
          onClick={() => move(1)}
          aria-label={`${label} — পরেরগুলো`}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
