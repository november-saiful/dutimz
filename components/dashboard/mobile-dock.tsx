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
 * The phone dock: four destinations plus a central create action on a handset,
 * drawn as a floating card at the foot of the screen.
 *
 * It is the reference deck's morphing tab bar (`expo-motion-tabs`) carried to the
 * web. The reference is React Native + Reanimated; the vocabulary is the same. The
 * current tab opens to reveal its label (the label's width animates from zero and
 * the tab grows with it), the icon crossfades from muted to white on the brand's
 * own colour, and a tap squeezes the tab.
 *
 * The indicator behind the current tab is a drop of liquid rather than a
 * rectangle that slides: two blobs, one chasing the tab the reader chose and one
 * a beat behind it, both inside an inline SVG goo filter, so the pair stretches
 * across the gap as a single shape and snaps back into one pill on arrival.
 *
 * The physics are the stylesheet's, not a library's: the blobs move on two CSS
 * curves that were fitted, frame by frame, to the spring pair the reference effect
 * runs (a stiff 400/30 leading pair and a looser 200/20 trailing one), so the drop
 * snaps to the tab with a hint of bounce and its tail arrives half a second in.
 * That keeps the dock one small `usePathname` island with no animation library in
 * the first load, and the site's global `prefers-reduced-motion` reset neutralises
 * every part of it for free.
 *
 * The blobs are *fed*, not computed: the tabs are content-sized flex children that
 * redistribute as one of them opens, so the liquid is written the tab's measured
 * box, frame by frame while the row settles, instead of a position the dock worked
 * out for itself.
 *
 * Phones only, and only below the width where the top bar has already handed its
 * desks to the menu, so no width has two competing navigations: the dock carries
 * four destinations plus a create action, the menu keeps every desk including
 * search.
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
 * The id of the inline goo filter the liquid layer points at with
 * `filter: url(#…)`. Namespaced: the dock is one component on a page that may hold
 * other SVGs, and it is a document-wide reference.
 */
const GOO_FILTER_ID = "dock-goo";

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

export function MobileDock({ deckGlass = false }: { deckGlass?: boolean } = {}) {
  // `usePathname` and nothing else: the dock reads no session, no query and no
  // network, so every page can render it.
  const pathname = usePathname() ?? "/";
  const [labelWidths, setLabelWidths] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(TABS.map((tab) => [tab.key, estimateLabelWidth(tab.label)])),
  );
  const labelRefs = React.useRef<Record<string, HTMLElement | null>>({});
  // The card, and the liquid layer whose printed edge the blobs are measured from.
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const gooRef = React.useRef<HTMLDivElement | null>(null);
  // The two blobs: the drop and the tail that lags behind it.
  const leadRef = React.useRef<HTMLDivElement | null>(null);
  const trailRef = React.useRef<HTMLDivElement | null>(null);
  /*
    Whether the blobs have been placed on the tab they belong to yet. Until they
    have, the layer stays out of the first paint rather than leaning at the left,
    and its first placement lands without a transition — the stylesheet starts
    moving the blobs only once this is set, and it is set in the same commit that
    writes their first geometry.
  */
  const [placed, setPlaced] = React.useState(false);

  // The tab the address stands for, or -1 on a page that is none of them (a story,
  // say), where the dock marks nothing and so shows no liquid either.
  const currentIndex = TABS.findIndex((tab) => tab.current(pathname));

  /*
    Where the liquid is, read from the row itself rather than worked out: the tabs
    are content-sized flex children that redistribute as one of them opens, so
    which pixels the current one occupies is the browser's answer, not ours. The
    rect is the tab's *transformed* box, which also carries the press squeeze into
    the blob for free.

    The write is plain style on the two blobs; their own transitions do the moving,
    which is why this can simply be handed a new answer whenever one arrives.
  */
  const readGeometry = React.useCallback(() => {
    const card = cardRef.current;
    const goo = gooRef.current;
    if (!card || !goo) return false;
    const current = card.querySelector<HTMLElement>('.dock-tab[aria-current="page"]');
    if (!current) return false;
    // The layer's own padding box is the blobs' origin: `inset: 0` on it, and
    // `left: 0` plus the translate on each blob.
    const from = goo.getBoundingClientRect();
    const box = current.getBoundingClientRect();
    const x = box.left - from.left;
    for (const blob of [leadRef.current, trailRef.current]) {
      if (!blob) continue;
      blob.style.transform = `translateX(${x}px)`;
      blob.style.width = `${box.width}px`;
    }
    return true;
  }, []);

  /*
    The first placement, before the first paint — the layout effect runs in the
    commit that hydrates the dock — lands the blobs where they belong with no
    motion, so nothing ever slides in from the card's edge. Every later placement
    animates on the stylesheet's two curves, which is the whole point of the layer.
  */
  React.useLayoutEffect(() => {
    if (readGeometry()) setPlaced(true);
  }, [readGeometry, pathname, labelWidths]);

  /*
    And then the row keeps talking: a switch settles over the label's own
    transition, a tap squeezes the tab, and the Bengali face swaps in after the
    first paint and re-measures every label. `ResizeObserver` reports those changes
    on the frame they happen, which is the frame the liquid should follow on.
  */
  React.useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const follow = () => readGeometry();
    const observer = new ResizeObserver(follow);
    observer.observe(card);
    for (const tab of card.querySelectorAll(".dock-tab")) observer.observe(tab);
    // A font that arrives after the observer was set up changes every width it is
    // watching at once; the callbacks cover it, and this covers the same tick.
    document.fonts?.ready.then(follow).catch(() => {});
    return () => observer.disconnect();
  }, [readGeometry]);

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

  // Nothing to mark: the row has not been measured yet, or no tab is current.
  const liquidIdle = !placed || currentIndex < 0;
  const [createOpen, setCreateOpen] = React.useState(false);
  const createButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const createPopRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!createOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCreateOpen(false);
        // The popover unmounts on close, so the caret is handed back to the
        // button that raised it rather than dropped to the page body.
        createButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    // The popover is a small dialog: the first action takes the caret on open.
    createPopRef.current?.querySelector("a")?.focus();
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
      {createOpen ? (
        <div ref={createPopRef} className="dock-create-pop" role="dialog" aria-modal="true" aria-label="প্রকাশ করুন">
          <p className="dock-create-title">প্রকাশ করুন</p>
          <ul className="dock-create-list">
            {CREATE_OPTIONS.map((option) => {
              const OptionIcon = option.icon;
              return (
                <li key={option.key}>
                  <Link className="dock-create-link" href={option.href} onClick={() => setCreateOpen(false)}>
                    <OptionIcon aria-hidden />
                    <span className="dock-create-text">
                      <span className="dock-create-name">{option.title}</span>
                      <span className="dock-create-sub">{option.sub}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {/* `data-deck-glass`: on the flipps decks the card floats over the reel's
          picture, and the stylesheet turns it into a glass pane there. */}
      <div className="dock-card" ref={cardRef} data-deck-glass={deckGlass || undefined}>
        {/*
          The goo, as the filter the layer below points at: blur the blobs, then
          push their alpha back to a hard edge, so wherever two of them overlap the
          blur bridges the gap and they read as one shape instead of two.
        */}
        <svg className="dock-goo-defs" aria-hidden="true" focusable="false">
          <defs>
            <filter
              id={GOO_FILTER_ID}
              x="-20%"
              y="-60%"
              width="140%"
              height="220%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              />
            </filter>
          </defs>
        </svg>
        {/*
          The liquid layer: the two blobs and nothing else, filtered as one surface
          and left behind the words. `data-hidden` covers the states with nothing to
          mark — before the first measurement, and on a page no tab stands for — and
          `data-placed` is what tells the stylesheet the first geometry is already
          down, so only later moves get a transition.
        */}
        <div
          className="dock-goo"
          ref={gooRef}
          aria-hidden="true"
          data-hidden={liquidIdle ? "" : undefined}
          data-placed={placed ? "" : undefined}
        >
          {/* The drop: it snaps to the tab the reader chose. */}
          <div className="dock-blob dock-lead" ref={leadRef} />
          {/* And its tail, on the looser curve, which is the stretch. */}
          <div className="dock-blob dock-trail" ref={trailRef} />
        </div>
        {/* The crisp layer: the icons and the words stay out of that filter. */}
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
      </div>
    </nav>
  );
}
