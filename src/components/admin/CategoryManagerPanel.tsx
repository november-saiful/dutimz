"use client";

import { useState, useEffect, useCallback } from "react";
import type { Category } from "@/types";
import { TableSkeleton } from "@/components/admin/AdminSkeleton";

const COPY = {
  title: "বিভাগ পরিচালনা",
  addNew: "নতুন বিভাগ",
  nameBn: "নাম (বাংলা)",
  nameEn: "নাম (English)",
  slug: "স্লাগ",
  description: "বিবরণ",
  active: "সক্রিয়",
  inactive: "নিষ্ক্রিয়",
  sortOrder: "ক্রম",
  save: "সংরক্ষণ",
  cancel: "বাতিল",
  delete: "মুছুন",
  confirmDelete: "মুছে ফেলবেন?",
  up: "উপরে",
  down: "নিচে",
  success: "সংরক্ষিত!",
  error: "ত্রুটি।",
  noCategories: "কোনো বিভাগ নেই।",
} as const;

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs outline-none focus:border-[var(--md-sys-color-primary)] dark:border-neutral-700 dark:bg-neutral-900";

export function CategoryManagerPanel() {
  const t = COPY;
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Category>>({});
  const [showNew, setShowNew] = useState(false);
  const [newData, setNewData] = useState({ name_bn: "", name_en: "", slug: "", description: "" });
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/categories");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setCategories(d.categories ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  function startEdit(cat: Category) {
    setEditing(cat.id);
    setEditData({ name_bn: cat.name_bn, name_en: cat.name_en, slug: cat.slug, description: cat.description, is_active: cat.is_active });
  }

  function cancelEdit() {
    setEditing(null);
    setEditData({});
  }

  async function saveEdit(id: string) {
    try {
      const res = await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...editData }),
      });
      if (!res.ok) throw new Error("Failed");
      const { category } = await res.json();
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...category } : c)));
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
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newData, sort_order: categories.length + 1 }),
      });
      if (!res.ok) throw new Error("Failed");
      const { category } = await res.json();
      setCategories((prev) => [...prev, category]);
      setShowNew(false);
      setNewData({ name_bn: "", name_en: "", slug: "", description: "" });
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
      const res = await fetch(`/api/admin/categories?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  async function moveCategory(idx: number, direction: -1 | 1) {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= categories.length) return;
    const newCats = [...categories];
    const temp = newCats[idx];
    const other = newCats[newIdx];
    if (temp && other) {
      newCats[idx] = other;
      newCats[newIdx] = temp;
    }
    setCategories(newCats);
    try {
      await fetch("/api/admin/categories/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: newCats.map((c) => c.id) }),
      });
    } catch {
      /* revert on error */
      setCategories((prev) => {
        const reverted = [...prev];
        const temp = reverted[idx];
        const other = reverted[newIdx];
        if (temp && other) {
          reverted[idx] = other;
          reverted[newIdx] = temp;
        }
        return reverted;
      });
    }
  }

  async function toggleActive(id: string, current: boolean) {
    try {
      const res = await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !current }),
      });
      if (!res.ok) throw new Error("Failed");
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, is_active: !c.is_active } : c)));
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  if (loading) return <TableSkeleton rows={5} />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-6 space-y-4" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">{t.title}</h3>
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
            className="rounded-full px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-80"
            style={{ background: "var(--md-sys-color-primary)" }}
          >
            + {t.addNew}
          </button>
        </div>

        {/* New category form */}
        {showNew && (
          <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--glass-border)" }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <input type="text" placeholder={t.nameBn} value={newData.name_bn} onChange={(e) => setNewData((p) => ({ ...p, name_bn: e.target.value }))} className={inputClass} />
              <input type="text" placeholder={t.nameEn} value={newData.name_en} onChange={(e) => setNewData((p) => ({ ...p, name_en: e.target.value }))} className={inputClass} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input type="text" placeholder={t.slug} dir="ltr" value={newData.slug} onChange={(e) => setNewData((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} className={inputClass} />
              <input type="text" placeholder={t.description} value={newData.description} onChange={(e) => setNewData((p) => ({ ...p, description: e.target.value }))} className={inputClass} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleCreate} className="rounded-full px-4 py-1.5 text-xs font-bold text-white" style={{ background: "var(--md-sys-color-primary)" }}>{t.save}</button>
              <button type="button" onClick={() => setShowNew(false)} className="rounded-full px-4 py-1.5 text-xs opacity-50 hover:opacity-100">{t.cancel}</button>
            </div>
          </div>
        )}

        {/* Error state */}
        {loadError && (
          <div className="rounded-lg p-4 text-center space-y-2" style={{ background: "rgba(234,67,53,0.05)" }}>
            <p className="text-xs" style={{ color: "var(--color-error, #ea4335)" }}>{loadError}</p>
            <button type="button" onClick={fetchCategories} className="text-xs font-bold" style={{ color: "var(--md-sys-color-primary)" }}>Retry</button>
          </div>
        )}

        {/* Category list */}
        <div className="space-y-1">
          {categories.map((cat, idx) => (
            <div key={cat.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-black/3 dark:hover:bg-white/3" style={{ borderBottom: "1px solid var(--glass-border)" }}>
              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5">
                <button type="button" disabled={idx === 0} onClick={() => moveCategory(idx, -1)} className="text-[10px] opacity-40 hover:opacity-100 disabled:opacity-10">▲</button>
                <button type="button" disabled={idx === categories.length - 1} onClick={() => moveCategory(idx, 1)} className="text-[10px] opacity-40 hover:opacity-100 disabled:opacity-10">▼</button>
              </div>

              {editing === cat.id ? (
                /* Edit mode */
                <div className="flex-1 grid gap-2 sm:grid-cols-4">
                  <input type="text" value={editData.name_bn ?? ""} onChange={(e) => setEditData((p) => ({ ...p, name_bn: e.target.value }))} className={inputClass} />
                  <input type="text" value={editData.name_en ?? ""} onChange={(e) => setEditData((p) => ({ ...p, name_en: e.target.value }))} className={inputClass} />
                  <input type="text" dir="ltr" value={editData.slug ?? ""} onChange={(e) => setEditData((p) => ({ ...p, slug: e.target.value }))} className={inputClass} />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => saveEdit(cat.id)} className="rounded-lg px-3 py-1 text-xs font-bold text-white" style={{ background: "var(--md-sys-color-primary)" }}>{t.save}</button>
                    <button type="button" onClick={cancelEdit} className="rounded-lg px-3 py-1 text-xs opacity-50">{t.cancel}</button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cat.name_bn} <span className="opacity-40">/ {cat.name_en}</span></p>
                    <p className="text-[10px] opacity-40" dir="ltr">{cat.slug}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleActive(cat.id, cat.is_active)}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cat.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"}`}
                  >
                    {cat.is_active ? t.active : t.inactive}
                  </button>
                  <button type="button" onClick={() => startEdit(cat)} className="text-xs opacity-50 hover:opacity-100">✏️</button>
                  <button type="button" onClick={() => handleDelete(cat.id)} className="text-xs opacity-50 hover:opacity-100">{t.delete}</button>
                </>
              )}
            </div>
          ))}
          {categories.length === 0 && <p className="py-8 text-center text-sm opacity-50">{t.noCategories}</p>}
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
