"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  BarChart3,
  Bookmark,
  FileText,
  Home,
  Info,
  Megaphone,
  PenLine,
  Plus,
  Scale,
  Search,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The phone dock. Five slots, with the menu raised in the centre: it opens the
 * quick-actions popover that lists every page, so the bottom bar stays short
 * while new pages have one obvious place to be added.
 *
 * The AI slot is intentionally inert for now — it renders so the layout is final
 * but does nothing until its behaviour is specified.
 */

type QuickAction = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** The pastel chip behind the row icon, matching the design. */
  chip: string;
};

/** Add future pages here; the popover renders whatever this list contains. */
const QUICK_ACTIONS: QuickAction[] = [
  { href: "/spotlight", label: "স্পটলাইট", icon: Megaphone, chip: "bg-[#baf5df]" },
  { href: "/saved", label: "সংরক্ষিত কনটেন্ট", icon: Bookmark, chip: "bg-[#f8c9e3]" },
  { href: "/statistics", label: "পরিসংখ্যান", icon: BarChart3, chip: "bg-[#d8e8ff]" },
  { href: "/corrections", label: "সংশোধন ও তথ্য যাচাই", icon: Scale, chip: "bg-[#ffe69a]" },
  { href: "/guidelines", label: "সম্পাদকীয় নীতিমালা", icon: FileText, chip: "bg-[#baf5df]" },
  { href: "/about", label: "আমাদের পরিচয়", icon: Info, chip: "bg-[#f8c9e3]" },
  { href: "/account/write", label: "প্রতিবেদন লিখুন", icon: PenLine, chip: "bg-[#d8e8ff]" },
];

function isActive(pathname: string, href: string, match: "exact" | "prefix"): boolean {
  if (match === "exact") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  // A route change (or a tap outside, or Escape) dismisses the popover.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const homeActive = isActive(pathname, "/", "exact");
  const searchActive = isActive(pathname, "/search", "prefix");
  const accountActive =
    isActive(pathname, "/account", "prefix") || isActive(pathname, "/u", "prefix");

  const itemClass = (active: boolean) =>
    cn(
      "flex min-w-0 flex-col items-center justify-end gap-1.5 pb-0.5 text-[11px] font-medium transition-colors",
      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center md:hidden">
      <div
        ref={wrapRef}
        className="pointer-events-auto relative mb-[max(0.75rem,env(safe-area-inset-bottom))] w-[min(470px,calc(100vw-1.75rem))]"
      >
        {/* The page list, anchored above the raised menu button. */}
        <section
          id="mobile-quick-panel"
          aria-label="সব পাতা"
          aria-hidden={!open}
          className={cn(
            "absolute bottom-[100px] left-1/2 z-10 w-[min(360px,calc(100vw-2.25rem))] -translate-x-1/2 rounded-[25px] border border-border bg-popover p-[17px] shadow-[0_18px_55px_rgba(27,35,50,.12),0_2px_8px_rgba(27,35,50,.05)]",
            "origin-bottom transition-[opacity,transform,visibility] duration-200",
            open
              ? "visible translate-y-0 scale-100 opacity-100"
              : "invisible translate-y-3 scale-[.97] opacity-0",
          )}
        >
          <div
            aria-hidden
            className="absolute -bottom-[7px] left-1/2 size-4 -translate-x-1/2 rotate-45 border-b border-r border-border bg-popover"
          />
          <ul className="relative flex flex-col gap-1.5">
            {QUICK_ACTIONS.map((action) => (
              <li key={action.href}>
                <Link
                  href={action.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3.5 rounded-[14px] px-1.5 py-1.5 text-[15px] font-semibold leading-tight text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "grid size-[42px] shrink-0 place-items-center rounded-full text-foreground",
                      action.chip,
                    )}
                  >
                    <action.icon className="size-5" strokeWidth={1.8} />
                  </span>
                  {action.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <nav
          aria-label="মোবাইল নেভিগেশন"
          className="relative grid h-[76px] grid-cols-5 items-end rounded-[26px] border border-border bg-card/95 px-2 pb-2.5 shadow-[0_12px_36px_rgba(25,35,52,.10)] backdrop-blur-sm"
        >
          <Link href="/" aria-current={homeActive ? "page" : undefined} className={itemClass(homeActive)}>
            <Home className="size-6" strokeWidth={1.6} />
            <span>হোম</span>
          </Link>

          <Link href="/search" aria-current={searchActive ? "page" : undefined} className={itemClass(searchActive)}>
            <Search className="size-6" strokeWidth={1.6} />
            <span>খুঁজুন</span>
          </Link>

          {/* Centre: raised toggle for the page list. */}
          <div className="relative flex justify-center self-stretch">
            <button
              type="button"
              id="mobile-quick-toggle"
              aria-label={open ? "মেনু বন্ধ করুন" : "সব পাতা খুলুন"}
              aria-expanded={open}
              aria-controls="mobile-quick-panel"
              onClick={() => setOpen((current) => !current)}
              className={cn(
                "absolute -top-6 grid size-[62px] place-items-center rounded-full border-[5px] border-background text-primary-foreground shadow-[0_5px_13px_rgba(240,68,85,.23)] transition-transform hover:-translate-y-0.5",
                open ? "bg-foreground" : "bg-primary",
              )}
            >
              {open ? (
                <Plus className="size-[23px] rotate-45" strokeWidth={1.8} />
              ) : (
                <Plus className="size-[23px]" strokeWidth={1.8} />
              )}
            </button>
            <span className="absolute bottom-1 text-[11px] font-semibold text-foreground">
              মেনু
            </span>
          </div>

          {/* Reserved for the assistant; inert until its behaviour is defined. */}
          <button
            type="button"
            disabled
            aria-label="এআই সহায়ক (শীঘ্রই আসছে)"
            className={cn(itemClass(false), "cursor-not-allowed opacity-60")}
          >
            <Sparkles className="size-6" strokeWidth={1.6} />
            <span>এআই</span>
          </button>

          <Link href="/account" aria-current={accountActive ? "page" : undefined} className={itemClass(accountActive)}>
            <UserRound className="size-6" strokeWidth={1.6} />
            <span>অ্যাকাউন্ট</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}
