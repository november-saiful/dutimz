"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  CircleUserRound,
  Clapperboard,
  Home,
  PenLine,
  Plus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The phone dock: four destinations plus a central create action, drawn as a
 * floating dark pill at the foot of the screen.
 *
 * It is `expo-motion-tabs`' behaviour carried to the web. The reference is
 * React Native + Reanimated; the vocabulary is the same, and the stylesheet
 * owns the physics:
 *
 * - the current tab opens into a white pill that grows to fit its label (the
 *   label's measured width is written to `--dock-label`; the tab's own flex
 *   sweep hands the space over),
 * - the label fades and slides in while the icon settles, and a press squeezes
 *   the icon on the reference's `scaleX 1.08 / scaleY 0.76`,
 * - the create action's menu is the library's card-morph panel: it grows from
 *   the dock's foot, sliding 65px and scaling from 0.97, on the reference's
 *   `cubic-bezier(0.22, 1, 0.36, 1)` over 600ms.
 *
 * The mechanics are CSS rather than a library, so the dock stays one small
 * `usePathname` island with no animation dependency in the first load, and the
 * site's global `prefers-reduced-motion` reset neutralises every part of it.
 *
 * Phones only, and only below the width where the top bar has already handed
 * its desks to the menu, so no width has two competing navigations.
 *
 * The entries are the reader-facing ones the top bar and the footer already
 * publish. The account tab stands for the member's own surfaces — the
 * dashboard, their public profile and their saved reports — because that is
 * where the header's account menu leads; a signed-out visitor who taps it lands
 * on the dashboard's own sign-in prompt, the same place the menu sends them.
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

const CREATE_OPTIONS: { key: string; href: string; title: string; sub: string; icon: LucideIcon }[] = [
  {
    key: "news",
    href: "/account/write/",
    title: "নিউজ প্রকাশ করুন",
    sub: "প্রতিবেদন লিখুন",
    icon: PenLine,
  },
  {
    // The query deep-links into the feed's publish modal (the forum opens its
    // composer when it sees `compose=1` and then cleans the address).
    key: "issue",
    href: "/spotlight/?compose=1",
    title: "ইস্যু প্রকাশ করুন",
    sub: "স্পটলাইটে লিখুন",
    icon: Sparkles,
  },
];

/**
 * A first guess at a label's width, for the server-rendered first paint, before
 * the mounted dock has measured the real thing. Bengali at the label's own
 * 12.5px/700 runs at roughly 4.3px per character plus a fixed 7px of glyph
 * overhead; the measurement below corrects this within a frame of mount, so it
 * only has to be close rather than right.
 */
function estimateLabelWidth(label: string) {
  return Math.round(label.length * 4.3) + 7;
}

export function MobileDock({ deckGlass = false }: { deckGlass?: boolean } = {}) {
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

  const [createOpen, setCreateOpen] = React.useState(false);
  const createButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const createPanelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!createOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCreateOpen(false);
        // The panel unmounts on close, so the caret is handed back to the
        // button that raised it rather than dropped to the page body.
        createButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    // The panel is a small dialog: the first action takes the caret on open.
    createPanelRef.current?.querySelector("a")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [createOpen]);

  function renderTab(tab: DockTab) {
    const Icon = tab.icon;
    const isCurrent = tab.current(pathname);
    return (
      <Link
        key={tab.key}
        href={tab.href}
        data-dock={tab.key}
        aria-current={isCurrent ? "page" : undefined}
        className={cn("dock-tab", isCurrent && "current")}
        style={{ "--dock-label": `${labelWidths[tab.key] ?? 0}px` } as React.CSSProperties}
      >
        <Icon className="dock-icon" size={20} strokeWidth={2.1} aria-hidden />
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
  }

  return (
    <nav className="dock" aria-label="প্রধান নেভিগেশন">
      {createOpen ? (
        <button
          type="button"
          className="dock-create-scrim"
          aria-label="প্রকাশ মেনু বন্ধ করুন"
          onClick={() => {
            setCreateOpen(false);
            createButtonRef.current?.focus();
          }}
        />
      ) : null}
      {/* `data-deck-glass`: on the flipps decks the card floats over the reel's
          picture, and the stylesheet turns it into a glass pane there. */}
      <div className="dock-card" data-deck-glass={deckGlass || undefined}>
        <div className="dock-row">
          {TABS.slice(0, 2).map(renderTab)}
          <button
            ref={createButtonRef}
            type="button"
            data-dock="create"
            aria-label="তৈরি করুন"
            aria-haspopup="dialog"
            aria-expanded={createOpen}
            onClick={() => setCreateOpen((open) => !open)}
            className={cn("dock-tab dock-create", createOpen && "current")}
          >
            <Plus className="dock-icon" size={22} strokeWidth={2.4} aria-hidden />
          </button>
          {TABS.slice(2).map(renderTab)}
        </div>

        {createOpen ? (
          <div
            ref={createPanelRef}
            className="dock-panel"
            role="dialog"
            aria-modal="true"
            aria-label="প্রকাশ করুন"
          >
            <p className="dock-panel-title">প্রকাশ করুন</p>
            <ul className="dock-panel-list">
              {CREATE_OPTIONS.map((option) => {
                const OptionIcon = option.icon;
                return (
                  <li key={option.key}>
                    <Link
                      className="dock-panel-link"
                      href={option.href}
                      onClick={() => setCreateOpen(false)}
                    >
                      <OptionIcon aria-hidden />
                      <span className="dock-panel-text">
                        <span className="dock-panel-name">{option.title}</span>
                        <span className="dock-panel-sub">{option.sub}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
