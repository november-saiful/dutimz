"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  CircleUserRound,
  Clapperboard,
  Home,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The phone dock: the five places a reader moves between on a handset, drawn as a
 * floating card at the foot of the screen.
 *
 * It is the reference deck's morphing tab bar (`expo-motion-tabs`) carried to the
 * web. The reference is React Native + Reanimated; the vocabulary is the same and
 * the engine is CSS — the active tab opens to reveal its label (the label's width
 * animates from zero and the tab grows with it), the accent pill behind it fades
 * in, the icon crossfades from muted to the brand's deep purple, and a tap
 * squeezes the tab.
 * Keeping it on CSS leaves the dock one small `usePathname` island with no
 * animation library in the first load, and the site's global
 * `prefers-reduced-motion` reset neutralises every part of it for free.
 *
 * Phones only, and only below the width where the top bar has already collapsed
 * its desks behind the burger, so no width has two competing navigations: the
 * dock carries the five primary destinations, the burger keeps every desk.
 *
 * The entries are the reader-facing ones the top bar and the footer already
 * publish. The account tab stands for the member's own surfaces — the dashboard,
 * their public profile and their saved reports — because that is where the
 * header's account menu leads; a signed-out visitor who taps it lands on the
 * dashboard's own sign-in prompt, the same place the menu sends them.
 */

type DockTab = {
  /** Stable id, also the `data-dock` attribute the stylesheet and the tests hook. */
  key: string;
  href: string;
  /** The Bengali name, revealed while the tab is the current one. */
  label: string;
  icon: LucideIcon;
  /** Whether this tab stands for the address the reader is on. */
  current: (pathname: string) => boolean;
};

const TABS: DockTab[] = [
  {
    key: "home",
    href: "/",
    label: "হোম",
    icon: Home,
    // Exactly the front page: `startsWith("/")` would light the tab everywhere.
    current: (pathname) => pathname === "/",
  },
  {
    key: "flipps",
    href: "/flipps/",
    label: "ফ্লিপস",
    icon: Clapperboard,
    current: (pathname) => pathname.startsWith("/flipps"),
  },
  {
    key: "search",
    href: "/search/",
    label: "খুঁজুন",
    icon: Search,
    current: (pathname) => pathname.startsWith("/search"),
  },
  {
    key: "spotlight",
    href: "/spotlight/",
    label: "স্পটলাইট",
    icon: Sparkles,
    current: (pathname) => pathname.startsWith("/spotlight"),
  },
  {
    key: "account",
    href: "/account/",
    label: "অ্যাকাউন্ট",
    icon: CircleUserRound,
    current: (pathname) =>
      pathname.startsWith("/account") ||
      pathname.startsWith("/saved") ||
      pathname.startsWith("/u/"),
  },
];

/**
 * A first guess at a label's width, for the server-rendered first paint, before
 * the mounted dock has measured the real thing. Bengali at the label's own 12px/700
 * runs at roughly 4.3px per character plus a fixed 7px of glyph overhead; the
 * measurement below corrects this within a frame of mount, so it only has to be
 * close rather than right.
 */
function estimateLabelWidth(label: string) {
  return Math.round(label.length * 4.3) + 7;
}

export function MobileDock() {
  // `usePathname` and nothing else: the dock reads no session, no query and no
  // network, so every page can render it.
  const pathname = usePathname() ?? "/";
  const [labelWidths, setLabelWidths] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(TABS.map((tab) => [tab.key, estimateLabelWidth(tab.label)])),
  );
  const labelRefs = React.useRef<Record<string, HTMLElement | null>>({});

  /*
    An open tab has to be exactly as wide as its label — an estimate that comes in
    under the real width clips the end of the word once the morph settles — so the
    dock measures what it actually renders, the way the reference deck's own
    measurement layer does.

    The text is measured through a range rather than through the box: a collapsed
    label is `width: 0`, so its box says nothing about the word inside it, and an
    open one would answer with the width it was already given.
  */
  React.useEffect(() => {
    function measure() {
      const next: Record<string, number> = {};
      const range = document.createRange();
      for (const tab of TABS) {
        const element = labelRefs.current[tab.key];
        if (!element) continue;
        range.selectNodeContents(element);
        const width = Math.ceil(range.getBoundingClientRect().width);
        if (width > 0) next[tab.key] = width;
      }
      // A label that has not laid out yet reports nothing; the estimate stands
      // until every one of them can be measured.
      if (Object.keys(next).length !== TABS.length) return;
      setLabelWidths((current) =>
        TABS.every((tab) => current[tab.key] === next[tab.key]) ? current : next,
      );
    }

    measure();
    // The Bengali face is swapped in after the first paint, which changes every
    // label's width, so the measurement follows the font rather than the mount.
    document.fonts?.ready.then(measure).catch(() => {});
  }, []);

  return (
    <nav className="dock" aria-label="প্রধান নেভিগেশন">
      <div className="dock-card">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isCurrent = tab.current(pathname);
          return (
            <Link
              key={tab.key}
              href={tab.href}
              data-dock={tab.key}
              aria-current={isCurrent ? "page" : undefined}
              className={cn("dock-tab", isCurrent && "current")}
              // The measured width of this tab's own label, in pixels.
              style={
                { "--dock-label": `${labelWidths[tab.key] ?? 0}px` } as React.CSSProperties
              }
            >
              {/* The accent pill the reference grows behind the active tab. */}
              <span className="dock-tint" aria-hidden />
              <Icon className="dock-icon" size={20} strokeWidth={2.1} aria-hidden />
              {/*
                Always rendered, never `display: none`: the label is the link's
                accessible name at every width, and the stylesheet only collapses
                its width so it can unfurl.
              */}
              <span
                className="dock-label"
                ref={(node) => {
                  labelRefs.current[tab.key] = node;
                }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
