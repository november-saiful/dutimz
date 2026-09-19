/**
 * Phase 4 Bookmark Grid — renders the signed-in user's saved stories.
 *
 * The API returns the bookmarked content rows themselves (with category and
 * author), so this no longer has to guess by looking ids up in bundled mock
 * data — that only ever matched a single demo article.
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

import type { ContentWithRelations } from "@/types";

const TYPE_ROUTES: Record<string, string> = {
  news: "/news",
  article: "/articles",
  documentary: "/documentaries",
};

const COPY = {
  title: "সংরক্ষিত নিবন্ধ",
  empty: "আপনি এখনো কোনো নিবন্ধ সংরক্ষণ করেননি।",
  browse: "ব্রাউজ করুন",
  signIn: "সংরক্ষিত নিবন্ধ দেখতে লগইন করুন।",
  signInCta: "লগইন করুন",
  error: "সংরক্ষিত নিবন্ধ লোড করা যায়নি।",
} as const;

export function BookmarkGrid() {
  const t = COPY;
  const [items, setItems] = useState<ContentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/bookmarks?contents=1");
        if (cancelled) return;
        if (res.status === 401) {
          setNeedsAuth(true);
          return;
        }
        if (!res.ok) {
          setError(t.error);
          return;
        }
        const data = (await res.json()) as { contents?: ContentWithRelations[] };
        if (!cancelled) setItems(data.contents ?? []);
      } catch {
        if (!cancelled) setError(t.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t.error]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (needsAuth) {
    return (
      <div className="glass-card p-12 text-center">
        <p className="text-lg opacity-60">{t.signIn}</p>
        <Link
          href="/auth/login"
          className="mt-4 inline-block rounded-full px-6 py-2 text-sm font-bold text-white"
          style={{ background: "var(--md-sys-color-primary)" }}
        >
          {t.signInCta}
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-8 text-center">
        <p role="alert" className="text-sm" style={{ color: "var(--color-error, #ea4335)" }}>
          {error}
        </p>
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
          const title = item.title_bn;
          const excerpt = item.excerpt_bn;
          const route = TYPE_ROUTES[item.content_type] ?? "/news";

          return (
            <Link
              key={item.id}
              href={`${route}/${item.slug}`}
              className="glass-card flex gap-4 p-4 transition-all hover:bg-neutral-50 dark:hover:bg-neutral-900"
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
