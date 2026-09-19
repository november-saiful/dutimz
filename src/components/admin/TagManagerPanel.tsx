"use client";

import { useState, useEffect, useCallback } from "react";
import { TableSkeleton } from "@/components/admin/AdminSkeleton";

const COPY = {
  title: "ট্যাগ পরিচালনা",
  addNew: "নতুন ট্যাগ",
  nameBn: "নাম (বাংলা)",
  nameEn: "নাম (English)",
  slug: "স্লাগ",
  usage: "ব্যবহার",
  search: "ট্যাগ খুঁজুন…",
  save: "সংরক্ষণ",
  cancel: "বাতিল",
  delete: "মুছুন",
  confirmDelete: "মুছে ফেলবেন?",
  success: "সংরক্ষিত!",
  error: "ত্রুটি।",
  noTags: "কোনো ট্যাগ নেই।",
} as const;

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs outline-none focus:border-[var(--md-sys-color-primary)] dark:border-neutral-700 dark:bg-neutral-900";

interface Tag {
  id: string;
  slug: string;
  name_bn: string;
  name_en: string;
  usage_count: number;
}

export function TagManagerPanel() {
  const t = COPY;
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Tag>>({});
  const [showNew, setShowNew] = useState(false);
  const [newData, setNewData] = useState({ name_bn: "", name_en: "", slug: "" });
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const fetchTags = useCallback(async (q: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = q ? `?search=${encodeURIComponent(q)}` : "";
      const res = await fetch(`/api/admin/tags${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setTags(d.tags ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTags(search); }, [search, fetchTags]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function saveEdit(id: string) {
    try {
      const res = await fetch("/api/admin/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...editData }),
      });
      if (!res.ok) throw new Error("Failed");
      const { tag } = await res.json();
      setTags((prev) => prev.map((t) => (t.id === id ? { ...t, ...tag } : t)));
      setEditing(null);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  async function handleCreate() {
    if (!newData.name_bn || !newData.name_en || !newData.slug) return;
    try {
      const res = await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newData),
      });
      if (!res.ok) throw new Error("Failed");
      const { tag } = await res.json();
      setTags((prev) => [tag, ...prev]);
      setShowNew(false);
      setNewData({ name_bn: "", name_en: "", slug: "" });
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
      const res = await fetch(`/api/admin/tags?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setTags((prev) => prev.filter((t) => t.id !== id));
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  if (loading) return <TableSkeleton rows={5} />;

  return (
    <div className="space-y-4">
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
              onClick={() => setShowNew(!showNew)}
              className="rounded-full px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-80"
              style={{ background: "var(--md-sys-color-primary)" }}
            >
              + {t.addNew}
            </button>
          </div>
        </div>

        {showNew && (
          <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--glass-border)" }}>
            <div className="grid gap-3 sm:grid-cols-3">
              <input type="text" placeholder={t.nameBn} value={newData.name_bn} onChange={(e) => setNewData((p) => ({ ...p, name_bn: e.target.value }))} className={inputClass} />
              <input type="text" placeholder={t.nameEn} value={newData.name_en} onChange={(e) => setNewData((p) => ({ ...p, name_en: e.target.value }))} className={inputClass} />
              <input type="text" placeholder={t.slug} dir="ltr" value={newData.slug} onChange={(e) => setNewData((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} className={inputClass} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleCreate} className="rounded-full px-4 py-1.5 text-xs font-bold text-white" style={{ background: "var(--md-sys-color-primary)" }}>{t.save}</button>
              <button type="button" onClick={() => setShowNew(false)} className="rounded-full px-4 py-1.5 text-xs opacity-50 hover:opacity-100">{t.cancel}</button>
            </div>
          </div>
        )}

        {loadError && (
          <div className="rounded-lg p-4 text-center space-y-2" style={{ background: "rgba(234,67,53,0.05)" }}>
            <p className="text-xs" style={{ color: "var(--color-error, #ea4335)" }}>{loadError}</p>
            <button type="button" onClick={() => fetchTags(search)} className="text-xs font-bold" style={{ color: "var(--md-sys-color-primary)" }}>Retry</button>
          </div>
        )}

        <div className="space-y-1">
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-black/3 dark:hover:bg-white/3" style={{ borderBottom: "1px solid var(--glass-border)" }}>
              {editing === tag.id ? (
                <div className="flex-1 grid gap-2 sm:grid-cols-3">
                  <input type="text" value={editData.name_bn ?? ""} onChange={(e) => setEditData((p) => ({ ...p, name_bn: e.target.value }))} className={inputClass} />
                  <input type="text" value={editData.name_en ?? ""} onChange={(e) => setEditData((p) => ({ ...p, name_en: e.target.value }))} className={inputClass} />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => saveEdit(tag.id)} className="rounded-lg px-3 py-1 text-xs font-bold text-white" style={{ background: "var(--md-sys-color-primary)" }}>{t.save}</button>
                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 py-1 text-xs opacity-50">{t.cancel}</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tag.name_bn} <span className="opacity-40">/ {tag.name_en}</span></p>
                    <p className="text-[10px] opacity-40" dir="ltr">{tag.slug}</p>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-medium dark:bg-neutral-800">
                    {tag.usage_count} {t.usage}
                  </span>
                  <button type="button" onClick={() => { setEditing(tag.id); setEditData({ name_bn: tag.name_bn, name_en: tag.name_en, slug: tag.slug }); }} className="text-xs opacity-50 hover:opacity-100">✏️</button>
                  <button type="button" onClick={() => handleDelete(tag.id)} className="text-xs opacity-50 hover:opacity-100">{t.delete}</button>
                </>
              )}
            </div>
          ))}
          {tags.length === 0 && <p className="py-8 text-center text-sm opacity-50">{t.noTags}</p>}
        </div>
      </div>

      {status !== "idle" && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-lg" style={{ background: status === "saved" ? "#34a853" : "#ea4335" }}>
          {status === "saved" ? t.success : t.error}
        </div>
      )}
    </div>
  );
}
