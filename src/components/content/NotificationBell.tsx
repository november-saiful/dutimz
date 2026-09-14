/**
 * Notification Bell — shows a bell icon with unread count badge
 * and a dropdown of recent notifications. Bengali-only UI.
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  BellIcon,
  CheckCheckIcon,
  ClockIcon,
  RocketIcon,
  ShieldAlertIcon,
  CloudCheckIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, typeof RocketIcon> = {
  breaking: RocketIcon,
  new_article: CloudCheckIcon,
  comment: ShieldAlertIcon,
  trending: RocketIcon,
};

const TYPE_COLORS: Record<string, string> = {
  breaking: "bg-red-500/10 text-red-600 dark:text-red-500",
  new_article: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500",
  comment: "bg-blue-500/10 text-blue-600 dark:text-blue-500",
  trending: "bg-orange-500/10 text-orange-600 dark:text-orange-500",
};

const TYPE_ROUTES: Record<string, string> = {
  breaking: "/news",
  new_article: "/news",
  comment: "/news",
  trending: "/news",
};

export interface Notification {
  id: string;
  type: "breaking" | "new_article" | "comment" | "trending";
  title: string;
  slug: string;
  read: boolean;
  createdAt: string;
}

function generateMockNotifications(): Notification[] {
  const now = Date.now();
  return [
    {
      id: "n1",
      type: "breaking",
      title: "মেট্রোরেলের নতুন সময়সূচি ঘোষণা",
      slug: "dhaka-metro-rail-new-timetable",
      read: false,
      createdAt: new Date(now - 300_000).toISOString(),
    },
    {
      id: "n2",
      type: "new_article",
      title: "বাংলা নিউজরুমে কৃত্রিম বুদ্ধিমত্তা",
      slug: "ai-in-bangla-newsrooms",
      read: false,
      createdAt: new Date(now - 3600_000).toISOString(),
    },
    {
      id: "n3",
      type: "trending",
      title: "টি-টোয়েন্টি সিরিজের জন্য দল ঘোষণা",
      slug: "bangladesh-t20-series-squad",
      read: true,
      createdAt: new Date(now - 7200_000).toISOString(),
    },
    {
      id: "n4",
      type: "comment",
      title: "নতুন মন্তব্য: দুতিমজ চালু করল দ্বিভাষিক সংবাদ পোর্টাল",
      slug: "dutimz-launches-bilingual-news-portal-2026",
      read: true,
      createdAt: new Date(now - 14400_000).toISOString(),
    },
  ];
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNotifications(generateMockNotifications());
  }, []);

  // Close on outside click (check both the trigger and the portaled panel)
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const clickedTrigger = panelRef.current?.contains(target);
      const clickedPanel = portalRef.current?.contains(target);
      if (!clickedTrigger && !clickedPanel) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "এইমাত্র";
    if (mins < 60) return `${mins}মি`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}ঘ`;
    return `${Math.floor(hrs / 24)}দি`;
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="nav-icon-btn group relative"
        aria-label="বিজ্ঞপ্তি"
      >
        <BellIcon className="size-5 transition-transform group-hover:scale-110" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
            style={{ background: "var(--md-sys-color-error, #ef4444)" }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && mounted && createPortal(
        <div
          ref={portalRef}
          className="notification-panel fixed z-50 w-[calc(100vw-1.5rem)] max-w-80 overflow-hidden rounded-3xl border border-neutral-100 bg-white shadow-lg transition-all dark:border-neutral-800/50 dark:bg-neutral-950/95 dark:backdrop-blur-xl"
          style={{ top: "4.5rem", right: "0.75rem" }}
        >
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 border-b border-neutral-100 bg-neutral-50/50 px-4 py-3 dark:border-neutral-800/50 dark:bg-neutral-900/50">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                  বিজ্ঞপ্তি
                </span>
                {unreadCount > 0 && (
                  <div className="rounded-full border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 text-[9px] leading-none font-bold text-orange-600 dark:bg-orange-500/20 dark:text-orange-500">
                    {unreadCount} নতুন
                  </div>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex size-7 items-center justify-center rounded-lg p-0 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-emerald-500 dark:hover:bg-neutral-800"
                  title="সব পঠিত করুন"
                >
                  <CheckCheckIcon className="size-3.5" />
                </button>
              )}
            </div>

            {/* Notification list */}
            <ul className="flex flex-col gap-1.5 p-2">
              {notifications.length === 0 ? (
                <li className="p-4 text-center text-xs opacity-40">
                  কোনো বিজ্ঞপ্তি নেই।
                </li>
              ) : (
                notifications.map((n) => {
                  const Icon = TYPE_ICONS[n.type] ?? BellIcon;
                  return (
                    <li key={n.id}>
                      <Link
                        href={`${TYPE_ROUTES[n.type]}/${n.slug}`}
                        onClick={() => {
                          markAsRead(n.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "group relative flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2.5 transition-all",
                          !n.read
                            ? "border-neutral-100 bg-neutral-50/50 dark:border-neutral-800 dark:bg-white/5"
                            : "border-transparent bg-transparent hover:border-neutral-100 hover:bg-neutral-50 dark:hover:border-neutral-800 dark:hover:bg-white/5",
                        )}
                      >
                        <div
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-xl border border-transparent transition-all group-hover:scale-105",
                            TYPE_COLORS[n.type],
                          )}
                        >
                          <Icon className="size-4" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-0">
                          <div className="line-clamp-2 text-[12px] leading-tight font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                            {n.title}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 opacity-60">
                            <ClockIcon className="size-2.5 text-neutral-400" />
                            <p className="text-[9px] font-normal tracking-tight whitespace-nowrap text-neutral-500">
                              {formatTime(n.createdAt)}
                            </p>
                          </div>
                        </div>
                        {!n.read && (
                          <span
                            className="mt-1 h-2 w-2 shrink-0 rounded-full"
                            style={{
                              background: "var(--md-sys-color-primary)",
                            }}
                          />
                        )}
                      </Link>
                    </li>
                  );
                })
              )}
            </ul>

            {/* Footer */}
            <div className="border-t border-neutral-100 p-3 dark:border-neutral-800">
              <Link
                href="/news"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-500 shadow-none transition-all hover:text-orange-500 active:scale-95 dark:border-neutral-800 dark:bg-neutral-950"
              >
                সব দেখুন
              </Link>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
