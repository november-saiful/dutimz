"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import { Drawer, ConfigProvider, Divider } from "antd";
import type { MenuProps } from "antd";
import {
  HomeOutlined,
  AppstoreOutlined,
  SearchOutlined,
  UserOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import type { Category } from "@/types";
import { DUTIMZMenu, type MenuItem } from "@/components/ui/menu";
import type { SessionUser } from "@/components/auth/UserMenu";

/**
 * Right-side navigation drawer (antd Drawer + Menu) that replaces the old
 * hamburger dropdown in GlassNavigation. Opens from the right panel, themed
 * with the Material 3 palette in both light and dark modes.
 */

const COPY = {
  title: "DUTIMZ",
  sections: "বিভাগসমূহ",
  account: "অ্যাকাউন্ট",
  myDesk: "আমার ডেস্ক",
  reporterDesk: "প্রতিবেদক ডেস্ক",
  reviewQueue: "পর্যালোচনা কিউ",
  adminPanel: "অ্যাডমিন প্যানেল",
  login: "লগইন",
  logout: "লগআউট",
  searchHint: "খুঁজুন…",
} as const;

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

  const items = useMemo<MenuItem[]>(() => {
    const list: MenuItem[] = [
      {
        key: "home",
        icon: <HomeOutlined />,
        label: "হোম",
      },
      {
        key: "search",
        icon: <SearchOutlined />,
        label: t.searchHint.replace("…", ""),
      },
    ];

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

    const accountChildren: MenuItem[] = user
      ? [
          { key: "profile", icon: <UserOutlined />, label: "প্রোফাইল" },
          { key: "logout", icon: <LogoutOutlined />, label: t.logout, danger: true },
        ]
      : [{ key: "login", icon: <UserOutlined />, label: t.login }];

    list.push({ type: "divider" });
    list.push({
      key: "account",
      icon: <TeamOutlined />,
      label: t.account,
      children: accountChildren,
    });

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
  }, [categories, user, isBn, t]);

  const handleClick: MenuProps["onClick"] = ({ key }) => {
    onClose();

    switch (key) {
      case "home":
        window.location.href = "/";
        break;
      case "search":
        onOpenSearch?.();
        break;
      case "profile":
        window.location.href = "/profile";
        break;
      case "login":
        window.location.href = "/auth/login";
        break;
      case "logout":
        void fetch("/auth/signout", { method: "POST" }).then(() => {
          window.location.href = "/";
        });
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

  return (
    <ConfigProvider
      theme={{
        algorithm: undefined, // set below via cssVar-friendly tokens
        token: {
          colorPrimary: "#1a73e8",
          colorBgElevated: "rgba(255, 255, 255, 0.92)",
          colorText: "rgba(0, 0, 0, 0.88)",
        },
        components: {
          Menu: {
            itemBg: "transparent",
            subMenuItemBg: "transparent",
            popupBg: "rgba(255, 255, 255, 0.95)",
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
          header: {
            background: "var(--glass-bg)",
            borderBottom: "1px solid var(--glass-border)",
            backdropFilter: "blur(20px) saturate(180%)",
            fontFamily: "var(--font-stack-bangla)",
          },
          body: {
            background: "var(--glass-bg)",
            backdropFilter: "blur(20px) saturate(180%)",
            paddingTop: 8,
            fontFamily: "var(--font-stack-bangla)",
          },
        }}
      >
        <div className="flex items-center gap-2 px-1 pb-3">
          <Image
            src="/dutimz-logo.svg"
            alt="DUTIMZ logo"
            width={32}
            height={32}
            className="h-8 w-auto"
          />
          <span className="text-sm font-bold">DUTIMZ</span>
        </div>
        <DUTIMZMenu
          mode="inline"
          items={items}
          onClick={handleClick}
          defaultOpenKeys={open ? ["sections"] : []}
          inlineIndent={14}
        />
        <Divider style={{ margin: "12px 0", borderColor: "var(--glass-border)" }} />
        <p className="px-2 text-xs opacity-50">
          {isBn ? "ঢাকা ইউনিভার্সিটি টাইম্‌জ" : "Dhaka University Times"}
        </p>
      </Drawer>
    </ConfigProvider>
  );
}
