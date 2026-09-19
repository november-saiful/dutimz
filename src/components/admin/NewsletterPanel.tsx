"use client";

import { useState, useEffect, useCallback } from "react";
import { TableSkeleton } from "@/components/admin/AdminSkeleton";

const COPY = {
  title: "নিউজলেটার সাবস্ক্রাইবার",
  totalSubscribers: "মোট সাবস্ক্রাইবার",
  activeSubscribers: "সক্রিয় সাবস্ক্রাইবার",
  email: "ইমেইল",
  locale: "ভাষা",
  status: "স্ট্যাটাস",
  subscribed: "সাবস্ক্রাইব",
  unsubscribed: "আনসাবস্ক্রাইব",
  active: "সক্রিয়",
  inactive: "নিষ্ক্রিয়",
  actions: "কার্যক্রম",
  unsubscribe: "আনসাবস্ক্রাইব",
  confirmUnsub: "আনসাবস্ক্রাইব করবেন?",
  exportCsv: "CSV এক্সপোর্ট",
  search: "ইমেইল খুঁজুন…",
  prev: "আগের",
  next: "পরের",
  page: "পৃষ্ঠা",
  total: "মোট",
  success: "সফল!",
  error: "ত্রুটি।",
  bangla: "বাংলা",
  english: "English",
} as const;

interface Subscriber {
  id: string;
  email: string;
  locale: string;
  is_active: boolean;
  created_at: string;
  unsubscribed_at: string | null;
}

export function NewsletterPanel() {
  const t = COPY;
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", String(page));
    try {
      const res = await fetch(`/api/admin/newsletter?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSubscribers(data.subscribers ?? []);
      setTotal(data.total ?? 0);
      setActiveCount(data.activeCount ?? 0);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { fetchSubscribers(); }, [fetchSubscribers]);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  async function handleUnsubscribe(id: string) {
    if (!confirm(t.confirmUnsub)) return;
    try {
      const res = await fetch(`/api/admin/newsletter?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setSubscribers((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: false, unsubscribed_at: new Date().toISOString() } : s)));
      setActiveCount((c) => Math.max(0, c - 1));
      setStatus("success");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  function exportCsv() {
    const header = "Email,Locale,Active,Subscribed At\n";
    const rows = subscribers
      .map((s) => `${s.email},${s.locale},${s.is_active},${s.created_at}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <TableSkeleton rows={5} />;

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
          <p className="text-lg font-bold">{total}</p>
          <p className="text-[10px] opacity-50">{t.totalSubscribers}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
          <p className="text-lg font-bold" style={{ color: "#34a853" }}>{activeCount}</p>
          <p className="text-[10px] opacity-50">{t.activeSubscribers}</p>
        </div>
      </div>

      <div className="rounded-xl p-6 space-y-4" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-bold">{t.title}</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t.search}
              className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs outline-none dark:border-neutral-700 dark:bg-neutral-900 w-48"
            />
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-full px-4 py-1.5 text-xs font-medium border transition hover:bg-black/5 dark:hover:bg-white/5"
              style={{ borderColor: "var(--glass-border)" }}
            >
              📥 {t.exportCsv}
            </button>
          </div>
        </div>

        {loadError && (
          <div className="rounded-lg p-4 text-center space-y-2" style={{ background: "rgba(234,67,53,0.05)" }}>
            <p className="text-xs" style={{ color: "var(--color-error, #ea4335)" }}>{loadError}</p>
            <button type="button" onClick={fetchSubscribers} className="text-xs font-bold" style={{ color: "var(--md-sys-color-primary)" }}>Retry</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b opacity-50" style={{ borderColor: "var(--glass-border)" }}>
                <th className="pb-2 font-medium">{t.email}</th>
                <th className="pb-2 font-medium hidden sm:table-cell">{t.locale}</th>
                <th className="pb-2 font-medium">{t.status}</th>
                <th className="pb-2 font-medium hidden md:table-cell">{t.subscribed}</th>
                <th className="pb-2 font-medium text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((sub) => (
                <tr key={sub.id} className="border-b" style={{ borderColor: "var(--glass-border)" }}>
                  <td className="py-3 text-xs" dir="ltr">{sub.email}</td>
                  <td className="py-3 text-xs hidden sm:table-cell">{sub.locale === "bn" ? t.bangla : t.english}</td>
                  <td className="py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        sub.is_active
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"
                      }`}
                    >
                      {sub.is_active ? t.active : t.inactive}
                    </span>
                  </td>
                  <td className="py-3 text-xs opacity-50 hidden md:table-cell">
                    {new Date(sub.created_at).toLocaleDateString("bn-BD")}
                  </td>
                  <td className="py-3 text-right">
                    {sub.is_active && (
                      <button
                        type="button"
                        onClick={() => handleUnsubscribe(sub.id)}
                        className="text-[10px] font-medium text-red-500 hover:text-red-700 transition"
                      >
                        {t.unsubscribe}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {subscribers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm opacity-50">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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

      {status !== "idle" && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-lg"
          style={{ background: status === "success" ? "#34a853" : "#ea4335" }}
        >
          {status === "success" ? t.success : t.error}
        </div>
      )}
    </div>
  );
}
