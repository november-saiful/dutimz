"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Category, Content } from "@/types";
import type { WorkflowAction } from "@/lib/content/workflow";
import { StatusBadge, WorkflowActions } from "@/components/reporter/StatusBadge";
import { useLocaleStore } from "@/stores/locale";
import { formatCount } from "@/lib/utils/format";

/**
 * Reporter queue: loads /api/reporter/contents, groups by status, renders
 * rows with per-row workflow actions (submit / unpublish / reopen…).
 */

interface Props {
  role: "reporter" | "moderator" | "admin";
  categories: Pick<Category, "id" | "name_bn" | "name_en">[];
}

const COPY = {
  bn: {
    all: "সব",
    drafts: "খসড়া",
    pending: "পর্যালোচনাধীন",
    published: "প্রকাশিত",
    rejected: "প্রত্যাখ্যাত",
    views: "বার পঠিত",
    empty: "এখনো কোনো লেখা নেই। নতুন লেখা দিয়ে শুরু করুন।",
    error: "লেখা লোড করা যায়নি।",
    updated: "সর্বশেষ পরিবর্তন",
    edit: "সম্পাদনা",
  },
  en: {
    all: "All",
    drafts: "Drafts",
    pending: "Pending review",
    published: "Published",
    rejected: "Rejected",
    views: "views",
    empty: "No stories yet. Start with a new draft.",
    error: "Could not load stories.",
    updated: "Updated",
    edit: "Edit",
  },
} as const;

type Filter = "all" | "draft" | "pending_review" | "published" | "rejected";

export function ReporterQueue({ role, categories }: Props) {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/reporter/contents");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!cancelled) setContents((data.contents ?? []) as Content[]);
      } catch {
        if (!cancelled) setError(t.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const by = (s: Content["status"]) => contents.filter((c) => c.status === s).length;
    return {
      all: contents.length,
      draft: by("draft"),
      pending_review: by("pending_review"),
      published: by("published"),
      rejected: by("rejected"),
    };
  }, [contents]);

  const visible = useMemo(
    () => (filter === "all" ? contents : contents.filter((c) => c.status === filter)),
    [contents, filter],
  );

  async function runAction(id: string, action: WorkflowAction) {
    setError(null);
    const res = await fetch(`/api/reporter/contents/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(String(data.error ?? "Action failed"));
      return;
    }
    const data = await res.json();
    const updated = data.content as Content;
    setContents((rows) => rows.map((r) => (r.id === id ? updated : r)));
  }

  async function remove(id: string) {
    const res = await fetch(`/api/reporter/contents/${id}`, { method: "DELETE" });
    if (res.ok) setContents((rows) => rows.filter((r) => r.id !== id));
  }

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: t.all, count: stats.all },
    { key: "draft", label: t.drafts, count: stats.draft },
    { key: "pending_review", label: t.pending, count: stats.pending_review },
    { key: "published", label: t.published, count: stats.published },
    { key: "rejected", label: t.rejected, count: stats.rejected },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="reporter-queue">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === f.key
                ? "text-white"
                : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
            style={
              filter === f.key
                ? { background: "var(--md-sys-color-primary)", color: "var(--md-sys-color-on-primary)" }
                : undefined
            }
          >
            {f.label} ({formatCount(f.count, locale)})
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-error, #ea4335)" }}>
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="opacity-70">{t.empty}</p>
          <Link
            href="/reporter/contents/new"
            className="mt-4 inline-block rounded-full px-5 py-2 text-sm font-bold text-white"
            style={{ background: "var(--md-sys-color-primary)" }}
          >
            + নতুন লেখা / New story
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((content) => {
            const category = categories.find((c) => c.id === content.category_id);
            return (
              <li key={content.id} className="glass-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={content.status} locale={locale} />
                      <span className="text-xs opacity-50">v{formatCount(content.version, locale)}</span>
                      {category && <span className="text-xs opacity-50">· {locale === "bn" ? category.name_bn : category.name_en}</span>}
                    </div>
                    <h2 className="mt-1.5 truncate text-lg font-bold">
                      <Link href={`/reporter/contents/${content.id}`} className="hover:underline">
                        {content.title_bn}
                      </Link>
                    </h2>
                    <p className="mt-0.5 text-xs opacity-60">
                      {t.updated}:{" "}
                      {new Date(content.updated_at).toLocaleString(
                        locale === "bn" ? "bn-BD" : "en-GB",
                        { dateStyle: "medium", timeStyle: "short" },
                      )}
                      {content.view_count > 0 && (
                        <> · {formatCount(content.view_count, locale)} {t.views}</>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <WorkflowActions
                      status={content.status}
                      role={role}
                      locale={locale}
                      onAction={(a) => void runAction(content.id, a)}
                    />
                    <div className="flex gap-3 text-xs">
                      <Link href={`/reporter/contents/${content.id}`} className="underline opacity-70 hover:opacity-100">
                        {t.edit}
                      </Link>
                      {["draft", "rejected"].includes(content.status) && (
                        <button
                          type="button"
                          onClick={() => void remove(content.id)}
                          className="underline opacity-70 hover:opacity-100"
                          style={{ color: "var(--color-error, #ea4335)" }}
                        >
                          {locale === "bn" ? "মুছুন" : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
