/**
 * Phase 4 Bookmark Grid — client component that fetches the user's
 * bookmarked content IDs and displays them as glass cards.
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocaleStore } from "@/stores/locale";
import type { ContentWithRelations } from "@/types";
import { mockContents } from "@/lib/data/mock";

const TYPE_ROUTES: Record<string, string> = {
  news: "/news",
  article: "/articles",
  documentary: "/documentaries",
};

const COPY = {
  bn: {
    title: "সংরক্ষিত নিবন্ধ",
    empty: "আপনি এখনো কোনো নিবন্ধ সংরক্ষণ করেননি।",
    browse: "ব্রাউজ করুন",
  },
  en: {
    title: "Saved Articles",
    empty: "You haven't saved any articles yet.",
    browse: "Browse",
  },
} as const;

export function BookmarkGrid() {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale];
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bookmarks")
      .then((r) => r.json())
      .then((data) => setBookmarkedIds(data.contentIds ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // In mock mode, find matching content from mock data
  const items = bookmarkedIds
    .map((id) => mockContents.find((c) => c.id === id))
    .filter(Boolean) as ContentWithRelations[];

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <p className="text-lg opacity-50">{t.empty}</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-full px-6 py-2 text-sm font-bold text-white"
          style={{ background: "var(--md-sys-color-primary)" }}
        >
          {t.browse} →
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">{t.title}</h1>
      <div className="space-y-4">
        {items.map((item) => {
          const title = (locale === "bn" ? item.title_bn : null) ?? item.title_en ?? item.title_bn;
          const excerpt = (locale === "bn" ? item.excerpt_bn : null) ?? item.excerpt_en ?? item.excerpt_bn;
          const route = TYPE_ROUTES[item.content_type] ?? "/news";

          return (
            <Link
              key={item.id}
              href={`${route}/${item.slug}`}
              className="glass-card flex gap-4 p-4 transition-all hover:scale-[1.01]"
            >
              {item.thumbnail_url && (
                <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg">
                  <Image
                    src={item.thumbnail_url}
                    alt={item.thumbnail_alt ?? title}
                    fill
                    className="object-cover"
                    sizes="112px"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm leading-snug line-clamp-2">{title}</h3>
                {excerpt && (
                  <p className="mt-1 text-xs opacity-60 line-clamp-1">{excerpt}</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
