"use client";

import * as React from "react";

import { relativeTimeBn } from "@/lib/site";

/**
 * A relative timestamp that keeps ticking in an open tab.
 *
 * Reader-facing times used to be baked into the cached HTML: the page revalidates
 * about once a minute, but a tab left open (or reached through client-side
 * navigation) kept saying "১ ঘণ্টা আগে" for hours. This renders the server's
 * string first — so hydration matches and slow networks still see a time — then
 * recomputes in the browser on mount and every 30 seconds after.
 */
export function RelativeTime({
  value,
  fallback,
  className,
}: {
  /** ISO timestamp, also used for the machine-readable `dateTime`. */
  value: string | null | undefined;
  /** The server-rendered text, shown until the first client recompute. */
  fallback?: string;
  className?: string;
}) {
  const [text, setText] = React.useState(fallback ?? relativeTimeBn(value));
  React.useEffect(() => {
    setText(relativeTimeBn(value));
    const timer = window.setInterval(() => {
      try {
        setText(relativeTimeBn(value));
      } catch {
        // A clock read cannot fail, but a frozen label is better than a crash.
        window.clearInterval(timer);
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [value]);
  if (!value) return <span className={className}>{text}</span>;
  let title: string | undefined;
  try {
    title = new Date(value).toLocaleString("bn-BD", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    title = undefined;
  }
  return (
    <time dateTime={value} title={title} className={className}>
      {text}
    </time>
  );
}
