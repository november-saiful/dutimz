"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { Category } from "@/types";
import { translate } from "@/lib/i18n/dictionary";
import { SITE_NAME_BN } from "@/lib/constants/brand";
import { useThemeStore } from "@/stores/theme";
import { useLocaleStore } from "@/stores/locale";
import { useUIStore } from "@/stores/ui";
import { UserMenu, type SessionUser } from "@/components/auth/UserMenu";
import { NavigationDrawer } from "@/components/ui/navigation-drawer";
import { NotificationBell } from "@/components/content/NotificationBell";

interface Props {
  categories: Category[];
  /** Signed-in user summary from the server layout; null when logged out. */
  user?: SessionUser | null;
}

export function GlassNavigation({ categories, user }: Props) {
  const locale = useLocaleStore((s) => s.locale);
  const openSearch = useUIStore((s) => s.openSearch);
  const { mode, setMode } = useThemeStore();
  const [mounted, setMounted] = useState(false);
  const isMobileMenuOpen = useUIStore((s) => s.isMobileMenuOpen);
  const toggleMobileMenu = useUIStore((s) => s.toggleMobileMenu);
  const closeMobileMenu = useUIStore((s) => s.closeMobileMenu);

  useEffect(() => setMounted(true), []);

  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const nextMode: "light" | "dark" | "system" =
    mode === "light" ? "dark" : mode === "dark" ? "system" : "light";

  const categoryLinks = categories.slice(0, 6);
  const navLinkClass =
    "rounded-full px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10";

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
                {t("nav.home")}
              </Link>
              {categoryLinks.map((cat) => (
                <Link key={cat.id} href={`/category/${cat.slug}`} className={navLinkClass}>
                  {locale === "bn" ? cat.name_bn : cat.name_en}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <NotificationBell />

            <button
              type="button"
              onClick={openSearch}
              className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label={t("nav.search")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setMode(nextMode)}
              className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label={t("theme.light")}
            >
              {mounted && mode === "dark" ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                </svg>
              )}
            </button>



            {user ? (
              <UserMenu user={user} />
            ) : (
              <Link
                href="/auth/login"
                className="rounded-full px-3 py-1.5 text-sm font-bold hover:bg-black/5 dark:hover:bg-white/10"
              >
                {t("nav.login")}
              </Link>
            )}

            <button
              type="button"
              onClick={toggleMobileMenu}
              className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10 lg:hidden"
              aria-expanded={isMobileMenuOpen}
              aria-label="Menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Right-side drawer replaces the old inline dropdown panel. */}
      <NavigationDrawer
        open={isMobileMenuOpen}
        onClose={closeMobileMenu}
        categories={categories}
        user={user}
        onOpenSearch={openSearch}
      />
    </header>
  );
}
