"use client";

import * as React from "react";

/**
 * The finale wordmark: each letter rises from behind its line once the word is on screen. The
 * letters are rendered server-side (so the name is always in the HTML); only the reveal is client
 * work, and the reduced-motion reset in globals.css shows the word at once.
 */
export function PaperWordmark({ text }: { text: string }) {
  const ref = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          el.classList.add("in");
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <h2
      ref={ref}
      className="paper-giant mx-auto my-[26px] mb-[34px] overflow-hidden text-center font-serif text-[clamp(58px,15.5vw,230px)] leading-[0.85] font-extrabold tracking-[-0.02em] whitespace-nowrap"
    >
      {[...text].map((character, index) => (
        <span
          key={`${character}-${index}`}
          style={{ "--gd": `${index * 0.045}s` } as React.CSSProperties}
        >
          {character === " " ? "\u00A0" : character}
        </span>
      ))}
    </h2>
  );
}
