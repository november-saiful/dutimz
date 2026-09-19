"use client";

import { useEffect, useState } from "react";
import { EyeIcon, FileTextIcon, ClockIcon, CheckCircleIcon } from "lucide-react";

interface ContentSummary {
  id: string;
  slug: string;
  title_bn: string;
  status: string;
  view_count: number;
  read_time: number | null;
}

interface Analytics {
  totalViews: number;
  totalStories: number;
  publishedCount: number;
  pendingCount: number;
  draftCount: number;
  avgReadTime: number;
  topStories: ContentSummary[];
}

export function ReporterAnalytics() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/reporter/contents");
        if (!res.ok) return;
        const data = await res.json();
        const contents: ContentSummary[] = data.contents ?? [];

        const totalViews = contents.reduce((sum, c) => sum + (c.view_count ?? 0), 0);
        const publishedCount = contents.filter((c) => c.status === "published").length;
        const pendingCount = contents.filter((c) => c.status === "pending_review").length;
        const draftCount = contents.filter((c) => c.status === "draft").length;
        const readTimes = contents.filter((c) => c.read_time != null).map((c) => c.read_time!);
        const avgReadTime = readTimes.length > 0 ? Math.round(readTimes.reduce((a, b) => a + b, 0) / readTimes.length) : 0;
        const topStories = [...contents].sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0)).slice(0, 5);

        setAnalytics({ totalViews, totalStories: contents.length, publishedCount, pendingCount, draftCount, avgReadTime, topStories });
      } catch { /* silently fail */ }
    }
    load();
  }, []);

  if (!analytics) return null;

  const cards = [
    { icon: EyeIcon, label: "মোট পঠিত", value: analytics.totalViews.toLocaleString("bn-BD") },
    { icon: FileTextIcon, label: "মোট লেখা", value: analytics.totalStories.toString() },
    { icon: CheckCircleIcon, label: "প্রকাশিত", value: analytics.publishedCount.toString() },
    { icon: ClockIcon, label: "গড় পড়ার সময়", value: `${analytics.avgReadTime} মিনিট` },
  ];

  const statusColors: Record<string, string> = {
    published: "text-green-600 dark:text-green-400",
    pending_review: "text-yellow-600 dark:text-yellow-400",
    draft: "text-gray-500",
    rejected: "text-red-600 dark:text-red-400",
  };

  const statusLabels: Record<string, string> = {
    published: "প্রকাশিত",
    pending_review: "পর্যালোচনাধীন",
    draft: "খসড়া",
    rejected: "প্রত্যাখ্যাত",
  };

  return (
    <div className="glass-card p-5">
      <h2 className="mb-4 text-lg font-bold">পরিসংখ্যান / Analytics</h2>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl p-3 text-center" style={{ background: "var(--md-sys-color-primary-container)" }}>
            <c.icon className="mx-auto mb-1 size-5 opacity-60" />
            <p className="text-xl font-bold">{c.value}</p>
            <p className="text-xs opacity-60">{c.label}</p>
          </div>
        ))}
      </div>

      {analytics.topStories.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold opacity-70">শীর্ষ লেখা / Top stories</h3>
          <ul className="space-y-2">
            {analytics.topStories.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "var(--glass-bg)" }}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.title_bn}</p>
                  <p className={`text-xs ${statusColors[s.status] ?? ""}`}>{statusLabels[s.status] ?? s.status}</p>
                </div>
                <span className="shrink-0 text-xs font-bold opacity-70">{(s.view_count ?? 0).toLocaleString("bn-BD")} পঠিত</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(analytics.draftCount > 0 || analytics.pendingCount > 0) && (
        <div className="mt-4 flex gap-4 text-xs opacity-60">
          {analytics.draftCount > 0 && <span>{analytics.draftCount} খসড়া</span>}
          {analytics.pendingCount > 0 && <span>{analytics.pendingCount} পর্যালোচনাধীন</span>}
        </div>
      )}
    </div>
  );
}
