"use client";

import * as React from "react";

/**
 * The reading bar's purple hairline: it widens with the reader's scroll
 * position. A passive scroll listener is enough — no frame loop, and the end
 * state is still for readers who ask for reduced motion.
 */
export function ReadingProgress() {
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    function update() {
      const max =
        document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? (window.scrollY || document.documentElement.scrollTop) / max : 0;
      setProgress(Math.min(1, Math.max(0, ratio)));
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <span
      className="progress"
      role="progressbar"
      aria-label="পড়ার অগ্রগতি"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ width: `${progress * 100}%` }}
    />
  );
}
