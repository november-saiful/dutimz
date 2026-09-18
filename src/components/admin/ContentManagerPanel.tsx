"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLocaleStore } from "@/stores/locale";

interface ContentRow {
  id: string;
  slug: string;
  title_bn: string;
  title_en: string;
  content_type: string;
  status: string;
  is_featured: boolean;
  is_breaking: boolean;
  view_count: number;
  published_at: string | null;
  created_at: string;
  category: { id: string; name_bn: string } | null;
}

const COPY = {
  bn: {
    title: "সংবাদ পরিচালনা",
    searchPlaceholder: "শিরোনাম বা স্লাগ খুঁজুন…",
    filterAll: "সব",
    published: "প্রকাশিত",
    draft: "খসড়া",
    pending: "পর্যালোচনার অপেক্ষায়",
    archived: "সংরক্ষিত",
    rejected: "প্রত্যাখ্যাত",
    news: "সংবাদ",
    article: "নিবন্ধ",
    documentary: "প্রামাণ্যচিত্র",
    type: "ধরন",
    status: "অবস্থা",
    views: "দর্শন",
    date: "তারিখ",
    actions: "কার্যক্রম",
    delete: "মুছুন",
    confirmDelete: "এই সংবাদটি মুছে ফেলবেন? এই কাজ ফেরানো যাবে না।",
    total: "মোট",
    page: "পৃষ্ঠা",
    prev: "আগের",
    next: "পরের",
    deleted: "মুছে ফেলা হয়েছে!",
    deleteFailed: "মুছে ফেলা যায়নি।",
    empty: "কোনো সংবাদ পাওয়া যায়নি।",
    view: "দেখুন",
  },
  en: {
    title: "Content Management",
    searchPlaceholder: "Search title or slug…",
    filterAll: "All",
    published: "Published",
    draft: "Draft",
    pending: "Pending Review",
    archived: "Archived",
    rejected: "Rejected",
    news: "News",
    article: "Article",
    documentary: "Documentary",
    type: "Type",
    status: "Status",
    views: "Views",
    date: "Date",
    actions: "Actions",
    delete: "Delete",
    confirmDelete: "Delete this article? This cannot be undone.",
    total: "Total",
    page: "Page",
    prev: "Previous",
    next: "Next",
    deleted: "Deleted!",
    deleteFailed: "Delete failed.",
    empty: "No content found.",
    view: "View",
  },
} as const;

const STATUS_FILTERS = ["", "published", "draft", "pending_review", "archived", "rejected"] as const;
const TYPE_FILTERS = ["", "news", "article", "documentary"] as const;

const STATUS_COLORS: Record<string, string> = {
  published: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  draft: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800",
  pending_review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  archived: "bg-neutral-100 text-neutral-400 dark:bg-neutral-800",
  rejected: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const TYPE_COLORS: Record<string, string> = {
  news: "text-[#5f2367] dark:text-[#dbbce0]",
  article: "text-[#a370a0] dark:text-[#dbbce0]",
  documentary: "text-[#5f2367] dark:text-[#dbbce0]",
};

export function ContentManagerPanel() {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<"success" | "error" | null>(null);

  const fetchContents = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);
    params.set("page", String(page));
    try {
      const res = await fetch(`/api/admin/contents?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setContents(data.contents ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, page]);

  useEffect(() => {
    fetchContents();
  }, [fetchContents]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`${t.confirmDelete}\n\n${title}`)) return;
    try {
      const res = await fetch(`/api/admin/contents?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setToast("success");
      fetchContents();
      setTimeout(() => setToast(null), 2000);
    } catch {
      setToast("error");
      setTimeout(() => setToast(null), 2000);
    }
  }

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      published: t.published,
      draft: t.draft,
      pending_review: t.pending,
      archived: t.archived,
      rejected: t.rejected,
    };
    return map[s] ?? s;
  };

  const typeLabel = (s: string) => {
    const map: Record<string, string> = {
      news: t.news,
      article: t.article,
      documentary: t.documentary,
    };
    return map[s] ?? s;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-6 space-y-4" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
        <h3 className="text-sm font-bold">{t.title}</h3>

        {/* Search + filters */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-400 focus:border-[var(--md-sys-color-primary)] dark:border-neutral-700 dark:bg-neutral-900 sm:w-64"
          />
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s || "all"}
                type="button"
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${statusFilter === s ? "text-white" : "opacity-50 hover:opacity-100"}`}
                style={statusFilter === s ? { background: "var(--md-sys-color-primary)" } : undefined}
              >
                {s ? statusLabel(s) : t.filterAll}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {TYPE_FILTERS.map((tp) => (
              <button
                key={tp || "all-type"}
                type="button"
                onClick={() => { setTypeFilter(tp); setPage(1); }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${typeFilter === tp ? "text-white" : "opacity-50 hover:opacity-100"}`}
                style={typeFilter === tp ? { background: "var(--md-sys-color-primary)" } : undefined}
              >
                {tp ? typeLabel(tp) : t.filterAll}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {loadError && !loading && (
          <div className="rounded-lg p-4 text-center space-y-2" style={{ background: "rgba(234,67,53,0.05)" }}>
            <p className="text-xs" style={{ color: "var(--color-error, #ea4335)" }}>{loadError}</p>
            <button type="button" onClick={fetchContents} className="text-xs font-bold" style={{ color: "var(--md-sys-color-primary)" }}>Retry</button>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-2 py-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3" style={{ borderBottom: "1px solid var(--glass-border)" }}>
                <div className="skeleton h-8 w-8 rounded shrink-0" />
                <div className="flex-1 space-y-1.5"><div className="skeleton h-3.5 w-3/4" /><div className="skeleton h-2.5 w-1/3" /></div>
                <div className="skeleton h-5 w-16 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* Content table */}
        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b opacity-50" style={{ borderColor: "var(--glass-border)" }}>
                  <th className="pb-2 font-medium">{t.title}</th>
                  <th className="pb-2 font-medium hidden md:table-cell">{t.type}</th>
                  <th className="pb-2 font-medium">{t.status}</th>
                  <th className="pb-2 font-medium hidden lg:table-cell">{t.views}</th>
                  <th className="pb-2 font-medium hidden lg:table-cell">{t.date}</th>
                  <th className="pb-2 font-medium text-right">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {contents.map((item) => (
                  <tr key={item.id} className="border-b" style={{ borderColor: "var(--glass-border)" }}>
                    <td className="py-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[260px]">{item.title_bn}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.category && (
                            <span className="text-[10px] opacity-50">{item.category.name_bn}</span>
                          )}
                          {item.is_breaking && (
                            <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-600 dark:text-red-400">
                              BRK
                            </span>
                          )}
                          {item.is_featured && (
                            <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-[9px] font-bold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                              ★
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 hidden md:table-cell">
                      <span className={`text-xs font-medium ${TYPE_COLORS[item.content_type] ?? ""}`}>
                        {typeLabel(item.content_type)}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_COLORS[item.status] ?? ""}`}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="py-3 text-xs opacity-50 hidden lg:table-cell">
                      {item.view_count.toLocaleString(locale === "bn" ? "bn-BD" : "en-US")}
                    </td>
                    <td className="py-3 text-xs opacity-50 hidden lg:table-cell">
                      {new Date(item.created_at).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-US")}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/news/${item.slug}`}
                          target="_blank"
                          className="rounded-lg px-2.5 py-1 text-[10px] font-medium opacity-50 hover:opacity-100 transition"
                          style={{ color: "var(--md-sys-color-primary)" }}
                        >
                          {t.view} ↗
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id, item.title_bn)}
                          className="rounded-lg bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
                        >
                          {t.delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {contents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm opacity-50">{t.empty}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs opacity-60">
          <span>{t.total}: {total}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg px-3 py-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5"
            >
              {t.prev}
            </button>
            <span>{t.page} {page}/{totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg px-3 py-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5"
            >
              {t.next}
            </button>
          </div>
        </div>
      </div>

      {/* Status toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-lg"
          style={{ background: toast === "success" ? "#34a853" : "#ea4335" }}
        >
          {toast === "success" ? t.deleted : t.deleteFailed}
        </div>
      )}
    </div>
  );
}
