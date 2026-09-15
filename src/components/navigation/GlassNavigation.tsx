"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import type { Category } from "@/types";
import { useThemeStore, type ThemeMode } from "@/stores/theme";
import { useUIStore } from "@/stores/ui";
import { UserMenu, type SessionUser } from "@/components/auth/UserMenu";
import { NavigationDrawer } from "@/components/ui/navigation-drawer";
import { NotificationBell } from "@/components/content/NotificationBell";
import SearchPopover from "@/components/ui/search-popover";

interface Props {
  categories: Category[];
  user?: SessionUser | null;
}

/** Apply the theme mode to the DOM. */
function applyTheme(mode: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

const MODE_LABELS: Record<ThemeMode, string> = {
  light: "হালকা",
  dark: "অন্ধকার",
  system: "সিস্টেম",
};

const MODE_CYCLE: Record<ThemeMode, ThemeMode> = {
  light: "dark",
  dark: "system",
  system: "light",
};

export function GlassNavigation({ categories, user }: Props) {
  const { mode, setMode } = useThemeStore();
  const [mounted, setMounted] = useState(false);
  const isMobileMenuOpen = useUIStore((s) => s.isMobileMenuOpen);
  const toggleMobileMenu = useUIStore((s) => s.toggleMobileMenu);
  const closeMobileMenu = useUIStore((s) => s.closeMobileMenu);

  // Sync dark class whenever mode changes
  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  // Listen for OS preference changes when in system mode
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  useEffect(() => setMounted(true), []);

  const handleToggle = useCallback(() => {
    const next = MODE_CYCLE[mode];
    setMode(next);
  }, [mode, setMode]);

  const nextMode = MODE_CYCLE[mode];
  const categoryLinks = categories.slice(0, 6);
  const navLinkClass =
    "rounded-full px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10";

  // Icons
  const SunIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  );
  const MoonIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
  const MonitorIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8m-4-4v4" />
    </svg>
  );

  const themeIcon = mode === "dark" ? SunIcon : mode === "light" ? MoonIcon : MonitorIcon;

  return (
    <header className="no-print sticky top-0 z-40">
      <nav className="glass-nav" aria-label="Main">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/" className="shrink-0 flex items-center gap-2">
              <Image
                src="/dutimz-logo.svg"
                alt="DUTIMZ logo"
                width={36}
                height={36}
                priority
                className="h-8 w-auto md:h-9"
              />
              <span className="text-lg font-bold leading-tight md:text-xl">
                DUTIMZ
              </span>
            </Link>
            <div className="hidden items-center gap-1 lg:flex">
              <Link href="/" className={navLinkClass}>
                হোম
              </Link>
              {categoryLinks.map((cat) => (
                <Link key={cat.id} href={`/category/${cat.slug}`} className={navLinkClass}>
                  {cat.name_bn}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <NotificationBell />

            <SearchPopover />

            <button
              type="button"
              onClick={handleToggle}
              className="nav-icon-btn hidden lg:flex"
              aria-label={`থিম: ${MODE_LABELS[nextMode]}`}
              title={MODE_LABELS[nextMode]}
            >
              {mounted ? themeIcon : MoonIcon}
            </button>

            <div className="hidden lg:flex">
              {user ? (
                <UserMenu user={user} />
              ) : (
                <Link
                  href="/auth/login"
                  className="rounded-full px-3 py-1.5 text-sm font-bold hover:bg-black/5 dark:hover:bg-white/10"
                >
                  লগইন
                </Link>
              )}
            </div>

            <button
              type="button"
              onClick={toggleMobileMenu}
              className="nav-icon-btn lg:hidden"
              aria-expanded={isMobileMenuOpen}
              aria-label="মেনু"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      <NavigationDrawer
        open={isMobileMenuOpen}
        onClose={closeMobileMenu}
        categories={categories}
        user={user}
      />
    </header>
  );
}
