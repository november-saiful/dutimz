"use client";

import * as React from "react";

import { bn } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * A carousel built on native scroll-snap, with the same parts as the Untitled UI carousel so its
 * markup can be used unchanged. It has no dependency beyond the browser: the slides are a horizontal
 * scroll container, and the controls move it one slide at a time.
 */

type CarouselContextValue = {
  scroller: React.RefObject<HTMLDivElement | null>;
  index: number;
  count: number;
  go: (index: number) => void;
};

const CarouselContext = React.createContext<CarouselContextValue | null>(null);

function useCarousel(): CarouselContextValue {
  const context = React.useContext(CarouselContext);
  if (!context) throw new Error("Carousel parts must be rendered inside Carousel.Root");
  return context;
}

/** The distance from one slide to the next: a slide's width plus the gap between slides. */
function stepOf(scroller: HTMLElement): number {
  const gap = parseFloat(getComputedStyle(scroller).columnGap) || 0;
  return scroller.clientWidth + gap;
}

function Root({ className, children, ...props }: React.ComponentProps<"div">) {
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = React.useState(0);
  const [count, setCount] = React.useState(0);

  const go = React.useCallback((next: number) => {
    const element = scroller.current;
    if (!element) return;
    element.scrollTo({ left: next * stepOf(element), behavior: "smooth" });
  }, []);

  // The active slide and the slide count follow what the reader actually sees, so the controls and
  // the indicator stay right after a swipe, a resize, or a keyboard scroll.
  React.useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const sync = () => {
      const step = stepOf(element);
      const total = element.children.length;
      setCount(total);
      setIndex(step > 0 ? Math.max(0, Math.min(total - 1, Math.round(element.scrollLeft / step))) : 0);
    };
    sync();
    element.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, []);

  const value = React.useMemo(() => ({ scroller, index, count, go }), [index, count, go]);

  return (
    <CarouselContext.Provider value={value}>
      <div
        role="region"
        aria-roledescription="carousel"
        className={cn("relative", className)}
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

function Content({ className, ...props }: React.ComponentProps<"div">) {
  const { scroller } = useCarousel();
  return (
    <div
      ref={scroller}
      className={cn(
        "flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

function Item({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      aria-roledescription="slide"
      className={cn("h-full w-full shrink-0 snap-center", className)}
      {...props}
    />
  );
}

function PrevTrigger({ className, children, ...props }: React.ComponentProps<"button">) {
  const { index, go } = useCarousel();
  return (
    <button
      type="button"
      aria-label="আগের ছবি"
      disabled={index <= 0}
      onClick={() => go(index - 1)}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}

function NextTrigger({ className, children, ...props }: React.ComponentProps<"button">) {
  const { index, count, go } = useCarousel();
  return (
    <button
      type="button"
      aria-label="পরের ছবি"
      disabled={index >= count - 1}
      onClick={() => go(index + 1)}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}

/** One dot per slide; the active slide is marked, and each dot moves the carousel to its slide. */
function CarouselIndicator({ framed = false, className }: { framed?: boolean; className?: string }) {
  const { index, count, go } = useCarousel();
  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        framed && "rounded-full bg-background/90 px-2.5 py-1.5 backdrop-blur-xs",
        className,
      )}
    >
      {Array.from({ length: count }, (_, position) => (
        <button
          key={position}
          type="button"
          aria-label={`ছবি ${bn(position + 1)}`}
          aria-current={position === index ? "true" : undefined}
          onClick={() => go(position)}
          className={cn(
            "size-1.5 rounded-full transition-colors",
            position === index ? "bg-foreground" : "bg-foreground/30",
          )}
        />
      ))}
    </div>
  );
}

const Carousel = { Root, Content, Item, PrevTrigger, NextTrigger };

export { Carousel, CarouselIndicator };
