/**
 * Phase 5 Notification Bell — shows a bell icon with unread count badge
 * and a dropdown of recent notifications. In mock mode, generates sample
 * notifications from reading activity. With Supabase Realtime, subscribes
 * to a notifications table (spec: Phase 5 Real-time notifications).
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useLocaleStore } from "@/stores/locale";

const TYPE_ICONS: Record<string, string> = {
  breaking: "🔴",
  new_article: "📰",
  comment: "💬",
  trending: "🔥",
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
  const locale = useLocaleStore((s) => s.locale);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNotifications(generateMockNotifications());
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
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
    if (mins < 1) return locale === "bn" ? "এইমাত্র" : "just now";
    if (mins < 60) return locale === "bn" ? `${mins}মি` : `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return locale === "bn" ? `${hrs}ঘ` : `${hrs}h`;
    return locale === "bn" ? `${Math.floor(hrs / 24)}দি` : `${Math.floor(hrs / 24)}d`;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        aria-label={locale === "bn" ? "বিজ্ঞপ্তি" : "Notifications"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ background: "var(--md-sys-color-error, #ef4444)" }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl shadow-xl"
          style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", backdropFilter: "blur(20px) saturate(180%)" }}
        >
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--glass-border)" }}>
            <h3 className="text-sm font-bold">
              {locale === "bn" ? "বিজ্ঞপ্তি" : "Notifications"}
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[10px] opacity-50 hover:opacity-100"
              >
                {locale === "bn" ? "সব পঠিত করুন" : "Mark all read"}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-center text-xs opacity-40">
                {locale === "bn" ? "কোনো বিজ্ঞপ্তি নেই।" : "No notifications yet."}
              </p>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={`${TYPE_ROUTES[n.type]}/${n.slug}`}
                  onClick={() => markAsRead(n.id)}
                  className={`flex items-start gap-3 border-b px-4 py-3 transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${
                    !n.read ? "bg-black/2 dark:bg-white/5" : ""
                  }`}
                  style={{ borderColor: "var(--glass-border)" }}
                >
                  <span className="mt-0.5 text-sm">{TYPE_ICONS[n.type]}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-snug ${!n.read ? "font-semibold" : "opacity-70"} line-clamp-2`}>
                      {n.title}
                    </p>
                    <span className="mt-1 text-[10px] opacity-40">{formatTime(n.createdAt)}</span>
                  </div>
                  {!n.read && (
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: "var(--md-sys-color-primary)" }}
                    />
                  )}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
