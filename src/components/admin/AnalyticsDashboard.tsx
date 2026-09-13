/**
 * Phase 5 Admin Analytics Dashboard — shows content performance metrics,
 * trending articles, view counts, and engagement stats. Bilingual.
 * Mock data for dev; Supabase aggregation queries in production.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocaleStore } from "@/stores/locale";
import { mockContents, mockCategories } from "@/lib/data/mock";

const COPY = {
  bn: {
    title: "অ্যানালিটিক্স ড্যাশবোর্ড",
    totalViews: "মোট পৃষ্ঠা দেখা",
    totalContent: "মোট কন্টেন্ট",
    totalComments: "মোট মন্তব্য",
    avgReadTime: "গড় পড়ার সময়",
    min: "মিনিট",
    trending: "ট্রেন্ডিং কন্টেন্ট",
    topCategories: "সর্বাধিক পঠিত বিভাগ",
    recentContent: "সাম্প্রতিক কন্টেন্ট",
    views: "বার পঠিত",
    publishedAt: "প্রকাশিত",
    viewsOverTime: "সময়ের সাথে পৃষ্ঠা দেখা",
    thisWeek: "এই সপ্তাহে",
    thisMonth: "এই মাসে",
    allTime: "সর্বকালের",
  },
  en: {
    title: "Analytics Dashboard",
    totalViews: "Total Page Views",
    totalContent: "Total Content",
    totalComments: "Total Comments",
    avgReadTime: "Avg. Read Time",
    min: "min",
    trending: "Trending Content",
    topCategories: "Most Read Categories",
    recentContent: "Recent Content",
    views: "views",
    publishedAt: "Published",
    viewsOverTime: "Views Over Time",
    thisWeek: "This Week",
    thisMonth: "This Month",
    allTime: "All Time",
  },
} as const;

export function AnalyticsDashboard() {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale];
  const [timeRange, setTimeRange] = useState<"week" | "month" | "all">("week");

  const published = mockContents.filter((c) => c.status === "published");
  const totalViews = published.reduce((sum, c) => sum + c.view_count, 0);
  const totalReadTime = published.reduce((sum, c) => sum + (c.read_time ?? 3), 0);
  const avgReadTime = published.length > 0 ? Math.round(totalReadTime / published.length) : 0;

  // Top content by views
  const trending = [...published].sort((a, b) => b.view_count - a.view_count).slice(0, 5);

  // Category engagement
  const catEngagement = mockCategories
    .map((cat) => {
      const catContent = published.filter((c) => c.category?.id === cat.id);
      const views = catContent.reduce((sum, c) => sum + c.view_count, 0);
      return { ...cat, views, count: catContent.length };
    })
    .filter((c) => c.views > 0)
    .sort((a, b) => b.views - a.views);

  // Mock comment count
  const totalComments = 15; // from publicMock seed data

  // Simulated weekly view data for chart
  const weeklyData = Array.from({ length: 7 }, (_, i) => ({
    day: locale === "bn" ? ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র", "শনি"][i] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i],
    views: Math.floor(Math.random() * 500 + 200),
  }));
  const maxViews = Math.max(...weeklyData.map((d) => d.views));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <div className="flex gap-1">
          {(["week", "month", "all"] as const).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setTimeRange(range)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                timeRange === range
                  ? "text-white"
                  : "opacity-50 hover:opacity-100"
              }`}
              style={timeRange === range ? { background: "var(--md-sys-color-primary)" } : {}}
            >
              {range === "week" ? t.thisWeek : range === "month" ? t.thisMonth : t.allTime}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t.totalViews} value={totalViews.toLocaleString()} icon="👁️" />
        <StatCard label={t.totalContent} value={String(published.length)} icon="📝" />
        <StatCard label={t.totalComments} value={String(totalComments)} icon="💬" />
        <StatCard label={t.avgReadTime} value={`${avgReadTime} ${t.min}`} icon="⏱️" />
      </div>

      {/* Views chart */}
      <div className="rounded-xl p-5" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
        <h3 className="mb-4 text-sm font-bold">{t.viewsOverTime}</h3>
        <div className="flex items-end gap-2 h-32">
          {weeklyData.map((d, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t transition-all duration-500"
                style={{
                  height: `${(d.views / maxViews) * 100}%`,
                  background: "var(--md-sys-color-primary)",
                  opacity: 0.3 + (d.views / maxViews) * 0.7,
                }}
              />
              <span className="text-[9px] opacity-40">{d.day}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trending */}
        <div className="rounded-xl p-5" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
          <h3 className="mb-4 text-sm font-bold">🔥 {t.trending}</h3>
          <div className="space-y-3">
            {trending.map((item, i) => {
              const title = (locale === "bn" ? item.title_bn : null) ?? item.title_en ?? item.title_bn;
              return (
                <div key={item.id} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "var(--md-sys-color-primary)" }}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <Link href={`/news/${item.slug}`} className="text-xs font-medium line-clamp-1 hover:underline">
                      {title}
                    </Link>
                    <span className="text-[10px] opacity-40">{item.view_count.toLocaleString()} {t.views}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category breakdown */}
        <div className="rounded-xl p-5" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
          <h3 className="mb-4 text-sm font-bold">📊 {t.topCategories}</h3>
          <div className="space-y-3">
            {catEngagement.map((cat) => {
              const maxCatViews = catEngagement[0]?.views ?? 1;
              return (
                <div key={cat.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs">{(locale === "bn" ? cat.name_bn : null) ?? cat.name_en ?? cat.name_bn}</span>
                    <span className="text-[10px] opacity-50">{cat.views.toLocaleString()} {t.views}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--md-sys-color-surface-variant)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(cat.views / maxCatViews) * 100}%`,
                        background: "var(--md-sys-color-primary)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent content table */}
      <div className="rounded-xl p-5" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
        <h3 className="mb-4 text-sm font-bold">📋 {t.recentContent}</h3>
        <div className="space-y-2">
          {published.slice(0, 8).map((item) => {
            const title = (locale === "bn" ? item.title_bn : null) ?? item.title_en ?? item.title_bn;
            return (
              <div key={item.id} className="flex items-center justify-between border-b py-2" style={{ borderColor: "var(--glass-border)" }}>
                <div className="min-w-0 flex-1">
                  <Link href={`/news/${item.slug}`} className="text-xs font-medium line-clamp-1 hover:underline">
                    {title}
                  </Link>
                  <span className="text-[10px] opacity-40">
                    {item.published_at ? new Date(item.published_at).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-US") : "—"}
                  </span>
                </div>
                <span className="ml-4 shrink-0 text-[10px] opacity-50">
                  {item.view_count.toLocaleString()} {t.views}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <div>
          <p className="text-lg font-bold leading-tight">{value}</p>
          <p className="text-[10px] opacity-50">{label}</p>
        </div>
      </div>
    </div>
  );
}
