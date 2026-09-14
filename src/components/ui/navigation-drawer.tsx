"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Drawer, ConfigProvider, Divider } from "antd";
import type { MenuProps } from "antd";
import {
  AppstoreOutlined,
  UserOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  LogoutOutlined,
  SunOutlined,
  MoonOutlined,
  DesktopOutlined,
} from "@ant-design/icons";
import type { Category } from "@/types";
import { DUTIMZMenu, type MenuItem } from "@/components/ui/menu";
import type { SessionUser } from "@/components/auth/UserMenu";
import { useThemeStore, type ThemeMode } from "@/stores/theme";

/**
 * Right-side navigation drawer (antd Drawer + Menu) that replaces the old
 * hamburger dropdown in GlassNavigation. Opens from the right panel, themed
 * with the Material 3 palette in both light and dark modes.
 */

const COPY = {
  title: "DUTIMZ",
  sections: "বিভাগসমূহ",
  myDesk: "আমার ডেস্ক",
  reporterDesk: "প্রতিবেদক ডেস্ক",
  reviewQueue: "পর্যালোচনা কিউ",
  adminPanel: "অ্যাডমিন প্যানেল",
  login: "লগইন",
  logout: "লগআউট",
  searchHint: "খুঁজুন…",
} as const;

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

export interface NavigationDrawerProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  user?: SessionUser | null;
  /** Called when the user taps the search entry. */
  onOpenSearch?: () => void;
}

export function NavigationDrawer({
  open,
  onClose,
  categories,
  user,
  onOpenSearch,
}: NavigationDrawerProps) {
  const t = COPY;
  const { mode, setMode } = useThemeStore();

  const handleThemeToggle = () => {
    const next = MODE_CYCLE[mode];
    setMode(next);
  };

  const themeIcon = mode === "dark" ? <SunOutlined /> : mode === "light" ? <MoonOutlined /> : <DesktopOutlined />;

  const items = useMemo<MenuItem[]>(() => {
    const list: MenuItem[] = [];

    if (categories.length > 0) {
      list.push({
        key: "sections",
        icon: <AppstoreOutlined />,
        label: t.sections,
        children: categories.map((cat) => ({
          key: `cat-${cat.slug}`,
          label: cat.name_bn,
        })),
      });
    }

    // Role-based desk shortcuts (mirrors UserMenu + MobileBottomDock).
    const role = user?.role;
    if (role === "reporter" || role === "moderator" || role === "admin") {
      list.push({
        key: "desk",
        icon: <TeamOutlined />,
        label: t.myDesk,
        children: [
          { key: "reporter", icon: <TeamOutlined />, label: t.reporterDesk },
          ...(role === "moderator" || role === "admin"
            ? [{ key: "moderator", icon: <SafetyCertificateOutlined />, label: t.reviewQueue }]
            : []),
          ...(role === "admin"
            ? [{ key: "admin", icon: <SafetyCertificateOutlined />, label: t.adminPanel }]
            : []),
        ],
      });
    }

    return list;
  }, [categories, user, t]);

  const handleClick: MenuProps["onClick"] = ({ key }) => {
    onClose();

    switch (key) {
      case "profile":
        window.location.href = "/profile";
        break;
      case "reporter":
        window.location.href = "/reporter";
        break;
      case "moderator":
        window.location.href = "/moderator";
        break;
      case "admin":
        window.location.href = "/admin";
        break;
      default:
        if (key.startsWith("cat-")) {
          window.location.href = `/category/${key.slice(4)}`;
        }
    }
  };

  const isDarkMode = mode === "dark" ||
    (mode === "system" && typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const drawerHeaderStyle: React.CSSProperties = isDarkMode
    ? { background: "#1e1e1e", color: "#f0f0f0", borderBottom: "1px solid rgba(255,255,255,0.08)", fontFamily: "var(--font-stack-bangla)" }
    : { background: "var(--glass-bg)", borderBottom: "1px solid var(--glass-border)", backdropFilter: "blur(20px) saturate(180%)", fontFamily: "var(--font-stack-bangla)" };

  const drawerBodyStyle: React.CSSProperties = isDarkMode
    ? { background: "#1e1e1e", color: "#f0f0f0", paddingTop: 8, fontFamily: "var(--font-stack-bangla)" }
    : { background: "var(--glass-bg)", backdropFilter: "blur(20px) saturate(180%)", paddingTop: 8, fontFamily: "var(--font-stack-bangla)" };

  return (
    <ConfigProvider
      theme={{
        algorithm: undefined,
        token: {
          colorPrimary: "#5f2367",
          colorBgElevated: isDarkMode ? "#1e1e1e" : "rgba(255, 255, 255, 0.92)",
          colorText: isDarkMode ? "#f0f0f0" : "rgba(0, 0, 0, 0.88)",
          colorTextSecondary: isDarkMode ? "#ccc" : undefined,
        },
        components: {
          Menu: {
            itemBg: "transparent",
            subMenuItemBg: "transparent",
            popupBg: isDarkMode ? "#2a2a2a" : "rgba(255, 255, 255, 0.95)",
            itemColor: isDarkMode ? "#e0e0e0" : undefined,
            itemHoverColor: isDarkMode ? "#ffffff" : undefined,
            itemSelectedColor: isDarkMode ? "#ffffff" : undefined,
            itemSelectedBg: isDarkMode ? "rgba(255,255,255,0.08)" : undefined,
            itemHoverBg: isDarkMode ? "rgba(255,255,255,0.06)" : undefined,
          },
        },
      }}
    >
      <Drawer
        title={t.title}
        placement="right"
        width={300}
        open={open}
        onClose={onClose}
        rootClassName="dutimz-nav-drawer"
        styles={{
          header: drawerHeaderStyle,
          body: drawerBodyStyle,
        }}
      >
        {/* Login / Account at the top */}
        {user ? (
          <Link
            href="/profile"
            onClick={onClose}
            className="flex items-center gap-3 rounded-lg px-2 py-2 mb-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                width={40}
                height={40}
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-full object-cover border border-white/40"
              />
            ) : (
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                style={{ background: "var(--md-sys-color-primary)" }}
              >
                {(user.displayName ?? user.email).charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{user.displayName ?? user.email}</p>
              <p className="truncate text-xs opacity-60" dir="ltr">{user.email}</p>
            </div>
          </Link>
        ) : (
          <Link
            href="/auth/login"
            onClick={onClose}
            className="flex items-center gap-2 rounded-lg px-2 py-2 mb-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <UserOutlined />
            <span>{t.login}</span>
          </Link>
        )}

        <Divider style={{ margin: "8px 0 12px", borderColor: "var(--glass-border)" }} />

        <DUTIMZMenu
          mode="inline"
          items={items}
          onClick={handleClick}
          defaultOpenKeys={open ? ["sections"] : []}
          inlineIndent={14}
        />
        <Divider style={{ margin: "12px 0", borderColor: "var(--glass-border)" }} />

        {/* Theme toggle */}
        <button
          type="button"
          onClick={handleThemeToggle}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          {themeIcon}
          <span>{MODE_LABELS[mode]}</span>
        </button>

        {/* Logout (only when signed in) */}
        {user && (
          <button
            type="button"
            onClick={() => {
              void fetch("/auth/signout", { method: "POST" }).then(() => {
                window.location.href = "/";
              });
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogoutOutlined />
            <span>{t.logout}</span>
          </button>
        )}

        <Divider style={{ margin: "12px 0", borderColor: "var(--glass-border)" }} />
        <p className="px-2 text-xs opacity-50">DUTIMZ</p>
      </Drawer>
    </ConfigProvider>
  );
}
