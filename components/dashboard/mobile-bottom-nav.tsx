"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  FileText,
  Home,
  Info,
  Plus,
  Scale,
  Search,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/site";

/**
 * The phone dock. Five slots, with the menu raised in the centre: it opens the
 * quick-actions popover that lists every page, so the bottom bar stays short
 * while new pages have one obvious place to be added.
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
  ...CATEGORIES.filter((category) => category.slug !== "all").map((category) => ({
    href: `/category/${category.slug}`,
    label: category.label,
    icon: FileText,
    chip: "bg-[#baf5df]",
  })),
  { href: "/corrections", label: "সংশোধন ও তথ্য যাচাই", icon: Scale, chip: "bg-[#ffe69a]" },
  { href: "/guidelines", label: "সম্পাদকীয় নীতিমালা", icon: FileText, chip: "bg-[#d8e8ff]" },
  { href: "/about", label: "আমাদের পরিচয়", icon: Info, chip: "bg-[#f8c9e3]" },
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
  const correctionsActive = isActive(pathname, "/corrections", "prefix");
  const aboutActive = isActive(pathname, "/about", "prefix");

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
          <ul className="relative flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
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
          className="relative grid h-[74px] grid-cols-5 items-end rounded-[28px] border border-border/80 bg-card/95 backdrop-blur-md px-2 pb-2.5 shadow-[0_16px_40px_rgba(25,35,52,.12),0_2px_8px_rgba(25,35,52,.04)]"
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
                "absolute -top-6 grid size-[62px] place-items-center overflow-hidden rounded-full border-[5px] border-background shadow-[0_5px_13px_rgba(95,35,103,.28)] transition-transform hover:-translate-y-0.5",
                open ? "bg-foreground text-primary-foreground" : "bg-[#5f2367]",
              )}
            >
              {open ? (
                <Plus className="size-[23px] rotate-45" strokeWidth={1.8} />
              ) : (
                // The site's own mark, not a generic icon: the centre slot is the DUTIMZ button.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/brand-icon.svg"
                  alt=""
                  width={62}
                  height={62}
                  className="size-full object-cover"
                />
              )}
            </button>
            <span className="absolute bottom-1 text-[11px] font-semibold text-foreground">
              মেনু
            </span>
          </div>

          <Link
            href="/corrections"
            aria-current={correctionsActive ? "page" : undefined}
            className={itemClass(correctionsActive)}
          >
            <Scale className="size-6" strokeWidth={1.6} />
            <span>সংশোধন</span>
          </Link>

          <Link href="/about" aria-current={aboutActive ? "page" : undefined} className={itemClass(aboutActive)}>
            <Info className="size-6" strokeWidth={1.6} />
            <span>পরিচয়</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}
