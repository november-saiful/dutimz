"use client";

import * as React from "react";

/**
 * Copies the address it is handed — an article's, or a reel's — and confirms it on the button
 * itself, so a reader sees the result where they pressed, without a page-wide toast or a second
 * render of the card.
 */
export function ShareStory({ href, label }: { href: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  async function copy(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const url = new URL(href, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access is refused in some embedded browsers; the link is still reachable.
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${label} — লিংক কপি করুন`}
      title={copied ? "লিংক কপি হয়েছে" : "লিংক কপি করুন"}
      className="grid size-6 place-items-center rounded-full transition-[background-color,transform] duration-300 hover:-rotate-12 hover:scale-110 hover:bg-border"
    >
      {copied ? (
        <span className="text-[10px] font-bold text-highlight" aria-hidden>
          ✓
        </span>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-3" aria-hidden>
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      )}
    </button>
  );
}
