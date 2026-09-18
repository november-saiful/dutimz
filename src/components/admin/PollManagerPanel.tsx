"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocaleStore } from "@/stores/locale";
import { PollsSkeleton } from "@/components/admin/AdminSkeleton";

const COPY = {
  bn: {
    title: "পোল পরিচালনা",
    addNew: "নতুন পোল",
    questionBn: "প্রশ্ন (বাংলা)",
    questionEn: "প্রশ্ন (English)",
    options: "অপশন",
    addOption: "অপশন যোগ করুন",
    optionBn: "অপশন (বাংলা)",
    optionEn: "অপশন (English)",
    active: "সক্রিয়",
    inactive: "নিষ্ক্রিয়",
    totalVotes: "মোট ভোট",
    votes: "ভোট",
    results: "ফলাফল",
    endsAt: "শেষের তারিখ",
    save: "সংরক্ষণ",
    cancel: "বাতিল",
    delete: "মুছুন",
    confirmDelete: "মুছে ফেলবেন?",
    success: "সংরক্ষিত!",
    error: "ত্রুটি।",
    noPolls: "কোনো পোল নেই।",
    noEnd: "কোনো সময়সীমা নেই",
  },
  en: {
    title: "Poll Management",
    addNew: "New poll",
    questionBn: "Question (Bangla)",
    questionEn: "Question (English)",
    options: "Options",
    addOption: "Add option",
    optionBn: "Option (Bangla)",
    optionEn: "Option (English)",
    active: "Active",
    inactive: "Inactive",
    totalVotes: "Total votes",
    votes: "votes",
    results: "Results",
    endsAt: "End date",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    confirmDelete: "Delete this poll?",
    success: "Saved!",
    error: "Error.",
    noPolls: "No polls.",
    noEnd: "No end date",
  },
} as const;

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs outline-none focus:border-[var(--md-sys-color-primary)] dark:border-neutral-700 dark:bg-neutral-900";

interface PollOption {
  id: string;
  label_bn: string;
  label_en: string;
  votes: number;
}

interface Poll {
  id: string;
  question_bn: string;
  question_en: string;
  options: PollOption[];
  totalVotes: number;
  is_active: boolean;
  ends_at: string | null;
  created_at: string;
}

export function PollManagerPanel() {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [viewResults, setViewResults] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    question_bn: string;
    question_en: string;
    options: { label_bn: string; label_en: string }[];
    is_active: boolean;
    ends_at: string;
  }>({
    question_bn: "",
    question_en: "",
    options: [{ label_bn: "", label_en: "" }, { label_bn: "", label_en: "" }],
    is_active: true,
    ends_at: "",
  });
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const fetchPolls = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/polls");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setPolls(d.polls ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolls(); }, [fetchPolls]);

  function resetForm() {
    setFormData({
      question_bn: "", question_en: "",
      options: [{ label_bn: "", label_en: "" }, { label_bn: "", label_en: "" }],
      is_active: true, ends_at: "",
    });
    setShowNew(false);
  }

  function addOption() {
    setFormData((p) => ({ ...p, options: [...p.options, { label_bn: "", label_en: "" }] }));
  }

  function removeOption(idx: number) {
    if (formData.options.length <= 2) return;
    setFormData((p) => ({ ...p, options: p.options.filter((_, i) => i !== idx) }));
  }

  function updateOption(idx: number, field: "label_bn" | "label_en", value: string) {
    setFormData((p) => {
      const opts = [...p.options];
      const existing = opts[idx];
      if (existing) {
        opts[idx] = { ...existing, [field]: value };
      }
      return { ...p, options: opts };
    });
  }

  async function handleCreate() {
    if (!formData.question_bn || !formData.question_en || formData.options.some((o) => !o.label_bn || !o.label_en)) return;
    try {
      const res = await fetch("/api/admin/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          ends_at: formData.ends_at || null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const { poll } = await res.json();
      setPolls((prev) => [poll, ...prev]);
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
      const res = await fetch(`/api/admin/polls?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setPolls((prev) => prev.filter((p) => p.id !== id));
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    try {
      const res = await fetch("/api/admin/polls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !current }),
      });
      if (!res.ok) throw new Error("Failed");
      setPolls((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: !p.is_active } : p)));
    } catch { /* noop */ }
  }

  if (loading) return <PollsSkeleton />;

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

        {showNew && (
          <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--glass-border)" }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold opacity-60">{t.questionBn}</label>
                <input type="text" value={formData.question_bn} onChange={(e) => setFormData((p) => ({ ...p, question_bn: e.target.value }))} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold opacity-60">{t.questionEn}</label>
                <input type="text" value={formData.question_en} onChange={(e) => setFormData((p) => ({ ...p, question_en: e.target.value }))} className={inputClass} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold opacity-60">{t.options}</label>
              {formData.options.map((opt, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="text" placeholder={t.optionBn} value={opt.label_bn} onChange={(e) => updateOption(i, "label_bn", e.target.value)} className={inputClass + " flex-1"} />
                  <input type="text" placeholder={t.optionEn} value={opt.label_en} onChange={(e) => updateOption(i, "label_en", e.target.value)} className={inputClass + " flex-1"} />
                  <button type="button" onClick={() => removeOption(i)} disabled={formData.options.length <= 2} className="text-xs opacity-40 hover:opacity-100 disabled:opacity-10">✕</button>
                </div>
              ))}
              <button type="button" onClick={addOption} className="text-xs opacity-50 hover:opacity-100">+ {t.addOption}</button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold opacity-60">{t.endsAt}</label>
                <input type="date" value={formData.ends_at} onChange={(e) => setFormData((p) => ({ ...p, ends_at: e.target.value }))} className={inputClass} />
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
              <button type="button" onClick={handleCreate} className="rounded-full px-4 py-1.5 text-xs font-bold text-white" style={{ background: "var(--md-sys-color-primary)" }}>{t.save}</button>
              <button type="button" onClick={resetForm} className="rounded-full px-4 py-1.5 text-xs opacity-50 hover:opacity-100">{t.cancel}</button>
            </div>
          </div>
        )}

        {loadError && (
          <div className="rounded-lg p-4 text-center space-y-2" style={{ background: "rgba(234,67,53,0.05)" }}>
            <p className="text-xs" style={{ color: "var(--color-error, #ea4335)" }}>{loadError}</p>
            <button type="button" onClick={fetchPolls} className="text-xs font-bold" style={{ color: "var(--md-sys-color-primary)" }}>Retry</button>
          </div>
        )}

        {/* Polls list */}
        <div className="space-y-3">
          {polls.map((poll) => (
            <div key={poll.id} className="rounded-lg p-4 space-y-2" style={{ border: "1px solid var(--glass-border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{poll.question_bn}</p>
                  <p className="text-xs opacity-40">{poll.question_en}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] opacity-40">
                    <span>{poll.totalVotes} {t.totalVotes}</span>
                    <span>•</span>
                    <span>{poll.ends_at ? `${t.endsAt}: ${new Date(poll.ends_at).toLocaleDateString()}` : t.noEnd}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleActive(poll.id, poll.is_active)}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${poll.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"}`}
                  >
                    {poll.is_active ? t.active : t.inactive}
                  </button>
                  <button type="button" onClick={() => setViewResults(viewResults === poll.id ? null : poll.id)} className="text-xs opacity-50 hover:opacity-100">
                    📊 {t.results}
                  </button>
                  <button type="button" onClick={() => handleDelete(poll.id)} className="text-xs opacity-50 hover:opacity-100">{t.delete}</button>
                </div>
              </div>

              {/* Results */}
              {viewResults === poll.id && (
                <div className="space-y-2 pt-2">
                  {poll.options.map((opt) => {
                    const pct = poll.totalVotes > 0 ? (opt.votes / poll.totalVotes) * 100 : 0;
                    return (
                      <div key={opt.id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs">{locale === "bn" ? opt.label_bn : opt.label_en}</span>
                          <span className="text-[10px] opacity-50">{opt.votes} {t.votes} ({Math.round(pct)}%)</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--md-sys-color-surface-variant)" }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: "var(--md-sys-color-primary)" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {polls.length === 0 && <p className="py-8 text-center text-sm opacity-50">{t.noPolls}</p>}
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
