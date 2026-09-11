"use client";

import { useMemo } from "react";
import { House, Search, Bookmark, Newspaper, UserRound } from "lucide-react";
import { LimelightNav, type NavItem } from "@/components/ui/limelight-nav";
import { useLocaleStore } from "@/stores/locale";
import { useUIStore } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";

/**
 * Mobile bottom dock (Phase 3 UX): fixed LimelightNav for small screens,
 * hidden on `tablet` and up. Items adapt to the signed-in role — editors get
 * a shortcut to the reporter desk.
 */

const COPY = {
  bn: {
    home: "হোম",
    search: "খুঁজুন",
    bookmarks: "বুকমার্ক",
    desk: "ডেস্ক",
    profile: "প্রোফাইল",
  },
  en: {
    home: "Home",
    search: "Search",
    bookmarks: "Bookmarks",
    desk: "Desk",
    profile: "Profile",
  },
} as const;

export function MobileBottomDock({ role }: { role?: string | null }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];
  const openSearch = useUIStore((s) => s.openSearch);
  const setMode = useThemeStore((s) => s.setMode);

  const items = useMemo<NavItem[]>(() => {
    const base: NavItem[] = [
      { id: "dock-home", icon: <House />, label: t.home, href: "/" },
      {
        id: "dock-search",
        icon: <Search />,
        label: t.search,
        onClick: () => {
          // The global search overlay is rendered by Providers.
          openSearch();
        },
      },
      { id: "dock-bookmarks", icon: <Bookmark />, label: t.bookmarks, href: "/bookmarks" },
    ];
    if (role === "reporter" || role === "moderator" || role === "admin") {
      base.push({ id: "dock-desk", icon: <Newspaper />, label: t.desk, href: "/reporter" });
    } else {
      base.push({ id: "dock-profile", icon: <UserRound />, label: t.profile, href: "/profile" });
    }
    return base;
  }, [role, t, openSearch]);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pointer-events-none tablet:hidden"
      data-testid="mobile-bottom-dock"
    >
      <div className="pointer-events-auto">
        <LimelightNav
          items={items}
          className="rounded-2xl px-1"
          limelightClassName="w-11"
        />
      </div>
    </div>
  );
}
