"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocaleStore } from "@/stores/locale";
import { TableSkeleton } from "@/components/admin/AdminSkeleton";

const COPY = {
  bn: {
    title: "বিজ্ঞাপন পরিচালনা",
    addNew: "নতুন বিজ্ঞাপন",
    name: "নাম",
    placement: "প্লেসমেন্ট",
    imageUrl: "ছবি URL",
    linkUrl: "লিংক URL",
    htmlContent: "HTML কন্টেন্ট",
    startDate: "শুরুর তারিখ",
    endDate: "শেষের তারিখ",
    active: "সক্রিয়",
    inactive: "নিষ্ক্রিয়",
    impressions: "ইম্প্রেশন",
    clicks: "ক্লিক",
    header: "হেডার",
    sidebar: "সাইডবার",
    inline: "ইনলাইন",
    footer: "ফুটার",
    save: "সংরক্ষণ",
    cancel: "বাতিল",
    delete: "মুছুন",
    confirmDelete: "মুছে ফেলবেন?",
    success: "সংরক্ষিত!",
    error: "ত্রুটি।",
    noAds: "কোনো বিজ্ঞাপন নেই।",
  },
  en: {
    title: "Ad Management",
    addNew: "New ad",
    name: "Name",
    placement: "Placement",
    imageUrl: "Image URL",
    linkUrl: "Link URL",
    htmlContent: "HTML content",
    startDate: "Start date",
    endDate: "End date",
    active: "Active",
    inactive: "Inactive",
    impressions: "Impressions",
    clicks: "Clicks",
    header: "Header",
    sidebar: "Sidebar",
    inline: "Inline",
    footer: "Footer",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    confirmDelete: "Delete this ad?",
    success: "Saved!",
    error: "Error.",
    noAds: "No ads.",
  },
} as const;

const PLACEMENTS = ["header", "sidebar", "inline", "footer"] as const;

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs outline-none focus:border-[var(--md-sys-color-primary)] dark:border-neutral-700 dark:bg-neutral-900";

interface Ad {
  id: string;
  name: string;
  placement: string;
  image_url: string | null;
  link_url: string | null;
  html_content: string | null;
  start_date: string | null;
  end_date: string | null;
  impression_count: number;
  click_count: number;
  is_active: boolean;
  created_at: string;
}

export function AdManagerPanel() {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "", placement: "header" as string,
    image_url: "", link_url: "", html_content: "",
    start_date: "", end_date: "", is_active: true,
  });
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const fetchAds = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/ads");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setAds(d.ads ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAds(); }, [fetchAds]);

  function resetForm() {
    setFormData({ name: "", placement: "header", image_url: "", link_url: "", html_content: "", start_date: "", end_date: "", is_active: true });
    setShowNew(false);
    setEditing(null);
  }

  function startEdit(ad: Ad) {
    setEditing(ad.id);
    setShowNew(true);
    setFormData({
      name: ad.name,
      placement: ad.placement,
      image_url: ad.image_url ?? "",
      link_url: ad.link_url ?? "",
      html_content: ad.html_content ?? "",
      start_date: ad.start_date ? ad.start_date.slice(0, 10) : "",
      end_date: ad.end_date ? ad.end_date.slice(0, 10) : "",
      is_active: ad.is_active,
    });
  }

  async function handleSave() {
    const payload = {
      ...formData,
      image_url: formData.image_url || null,
      link_url: formData.link_url || null,
      html_content: formData.html_content || null,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
    };

    try {
      if (editing) {
        const res = await fetch("/api/admin/ads", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing, ...payload }),
        });
        if (!res.ok) throw new Error("Failed");
        const { ad } = await res.json();
        setAds((prev) => prev.map((a) => (a.id === editing ? { ...a, ...ad } : a)));
      } else {
        const res = await fetch("/api/admin/ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed");
        const { ad } = await res.json();
        setAds((prev) => [ad, ...prev]);
      }
      resetForm();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t.confirmDelete)) return;
    try {
      const res = await fetch(`/api/admin/ads?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setAds((prev) => prev.filter((a) => a.id !== id));
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    try {
      const res = await fetch("/api/admin/ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !current }),
      });
      if (!res.ok) throw new Error("Failed");
      setAds((prev) => prev.map((a) => (a.id === id ? { ...a, is_active: !a.is_active } : a)));
    } catch { /* noop */ }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-6 space-y-4" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">{t.title}</h3>
          <button
            type="button"
            onClick={() => { resetForm(); setShowNew(!showNew); }}
            className="rounded-full px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-80"
            style={{ background: "var(--md-sys-color-primary)" }}
          >
            + {t.addNew}
          </button>
        </div>

        {/* Form */}
        {showNew && (
          <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--glass-border)" }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold opacity-60">{t.name}</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold opacity-60">{t.placement}</label>
                <select value={formData.placement} onChange={(e) => setFormData((p) => ({ ...p, placement: e.target.value }))} className={inputClass}>
                  {PLACEMENTS.map((p) => (
                    <option key={p} value={p}>{t[p]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold opacity-60">{t.imageUrl}</label>
                <input type="url" dir="ltr" value={formData.image_url} onChange={(e) => setFormData((p) => ({ ...p, image_url: e.target.value }))} className={inputClass} placeholder="https://…" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold opacity-60">{t.linkUrl}</label>
                <input type="url" dir="ltr" value={formData.link_url} onChange={(e) => setFormData((p) => ({ ...p, link_url: e.target.value }))} className={inputClass} placeholder="https://…" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold opacity-60">{t.htmlContent}</label>
              <textarea rows={2} value={formData.html_content} onChange={(e) => setFormData((p) => ({ ...p, html_content: e.target.value }))} className={inputClass} placeholder="<div>…</div>" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold opacity-60">{t.startDate}</label>
                <input type="date" value={formData.start_date} onChange={(e) => setFormData((p) => ({ ...p, start_date: e.target.value }))} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold opacity-60">{t.endDate}</label>
                <input type="date" value={formData.end_date} onChange={(e) => setFormData((p) => ({ ...p, end_date: e.target.value }))} className={inputClass} />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <button
                  type="button"
                  onClick={() => setFormData((p) => ({ ...p, is_active: !p.is_active }))}
                  className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${formData.is_active ? "bg-green-500" : "bg-black/15 dark:bg-white/20"}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${formData.is_active ? "translate-x-[18px]" : "translate-x-[4px]"}`} />
                </button>
                <span className="text-xs">{formData.is_active ? t.active : t.inactive}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleSave} className="rounded-full px-4 py-1.5 text-xs font-bold text-white" style={{ background: "var(--md-sys-color-primary)" }}>{t.save}</button>
              <button type="button" onClick={resetForm} className="rounded-full px-4 py-1.5 text-xs opacity-50 hover:opacity-100">{t.cancel}</button>
            </div>
          </div>
        )}

        {loadError && !loading && (
          <div className="rounded-lg p-4 text-center space-y-2" style={{ background: "rgba(234,67,53,0.05)" }}>
            <p className="text-xs" style={{ color: "var(--color-error, #ea4335)" }}>{loadError}</p>
            <button type="button" onClick={fetchAds} className="text-xs font-bold" style={{ color: "var(--md-sys-color-primary)" }}>Retry</button>
          </div>
        )}

        {/* Ads list */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3" style={{ borderBottom: "1px solid var(--glass-border)" }}>
                <div className="flex-1 space-y-1.5"><div className="skeleton h-3.5 w-1/2" /><div className="skeleton h-2.5 w-1/3" /></div>
                <div className="skeleton h-5 w-14 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        ) : (
        <div className="space-y-1">
          {ads.map((ad) => (
            <div key={ad.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ borderBottom: "1px solid var(--glass-border)" }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{ad.name}</p>
                <div className="flex items-center gap-2 text-[10px] opacity-40">
                  <span>{ad.placement}</span>
                  <span>•</span>
                  <span>{ad.impression_count.toLocaleString()} {t.impressions}</span>
                  <span>•</span>
                  <span>{ad.click_count.toLocaleString()} {t.clicks}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleActive(ad.id, ad.is_active)}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${ad.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"}`}
              >
                {ad.is_active ? t.active : t.inactive}
              </button>
              <button type="button" onClick={() => startEdit(ad)} className="text-xs opacity-50 hover:opacity-100">✏️</button>
              <button type="button" onClick={() => handleDelete(ad.id)} className="text-xs opacity-50 hover:opacity-100">{t.delete}</button>
            </div>
          ))}
          {ads.length === 0 && <p className="py-8 text-center text-sm opacity-50">{t.noAds}</p>}
        </div>
        )}
      </div>

      {status !== "idle" && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-lg" style={{ background: status === "saved" ? "#34a853" : "#ea4335" }}>
          {status === "saved" ? t.success : t.error}
        </div>
      )}
    </div>
  );
}
