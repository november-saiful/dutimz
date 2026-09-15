"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Content } from "@/types";
import type { WorkflowAction } from "@/lib/content/workflow";
import { StatusBadge, WorkflowActions } from "@/components/reporter/StatusBadge";
import { useLocaleStore } from "@/stores/locale";
import { formatCount } from "@/lib/utils/format";

/**
 * Moderation queue (Phase 3): pending_review stories with moderation actions.
 * Reject / request-changes prompt for a note that lands in the revision
 * history and (in a later phase) the reporter's notifications.
 */

interface Props {
  role: "moderator" | "admin";
}

const COPY = {
  bn: {
    pending: "পর্যালোচনাধীন",
    decided: "সাম্প্রতিক সিদ্ধান্ত",
    empty: "কিউ খালি — কোনো লেখা অপেক্ষা করছে না।",
    error: "কিউ লোড করা যায়নি।",
    notePh: "প্রতিবেদকের জন্য নোট (প্রত্যাখ্যান/সংশোধনে প্রযোজ্য)…",
    view: "দেখুন",
    reviewer: "সম্পাদক",
    bodyPreview: "সারপ্রেভিউ",
  },
  en: {
    pending: "Pending review",
    decided: "Recently decided",
    empty: "Queue is clear — no stories waiting.",
    error: "Could not load the queue.",
    notePh: "Note for the reporter (used on reject / request changes)…",
    view: "View",
    reviewer: "Editor",
    bodyPreview: "Preview",
  },
} as const;

function bodyPreview(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function ModerationQueue({ role }: Props) {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/moderator/queue");
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

  async function runAction(id: string, action: WorkflowAction) {
    setBusyId(id);
    setError(null);
    const note = notes[id]?.trim() || undefined;
    // Moderation decisions never change fields — actions only.
    const res = await fetch("/api/moderator/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action, note }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(String(data.error ?? "Action failed"));
      return;
    }
    const updated = data.content as Content;
    setContents((rows) => rows.map((r) => (r.id === id ? updated : r)));
    setNotes((n) => ({ ...n, [id]: "" }));
  }

  const pending = contents.filter((c) => c.status === "pending_review");
  const decided = contents.filter((c) => c.status !== "pending_review");

  const rowClass = "glass-card p-4";

  return (
    <div className="flex flex-col gap-4" data-testid="moderation-queue">
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-error, #ea4335)" }}>
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : contents.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="opacity-70">{t.empty}</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wide opacity-60">
                {t.pending} ({formatCount(pending.length, locale)})
              </h2>
              {pending.map((content) => (
                <div key={content.id} className={rowClass}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={content.status} locale={locale} />
                        <span className="text-xs opacity-50">v{formatCount(content.version, locale)}</span>
                      </div>
                      <h3 className="mt-1.5 text-lg font-bold">
                        <Link href={`/reporter/contents/${content.id}`} className="hover:underline">
                          {content.title_bn}
                        </Link>
                      </h3>
                      {content.excerpt_bn && (
                        <p className="mt-0.5 line-clamp-2 text-sm opacity-70">{content.excerpt_bn}</p>
                      )}
                      {!content.excerpt_bn && bodyPreview(content.body_bn) && (
                        <p className="mt-0.5 line-clamp-2 text-sm opacity-70">
                          {bodyPreview(content.body_bn)}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/reporter/contents/${content.id}`}
                      className="rounded-full border border-neutral-200 px-4 py-1.5 text-xs font-bold hover:bg-black/5 dark:border-neutral-700 dark:hover:bg-white/10"
                    >
                      {t.view}
                    </Link>
                  </div>

                  <input
                    type="text"
                    value={notes[content.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [content.id]: e.target.value }))}
                    placeholder={t.notePh}
                    className="mt-3 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm outline-none placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
                  />

                  <div className="mt-3">
                    <WorkflowActions
                      status={content.status}
                      role={role}
                      locale={locale}
                      onAction={(a) => void runAction(content.id, a)}
                      disabled={busyId === content.id}
                    />
                  </div>
                </div>
              ))}
            </section>
          )}

          {decided.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wide opacity-60">
                {t.decided} ({formatCount(decided.length, locale)})
              </h2>
              <ul className="flex flex-col gap-2">
                {decided.map((content) => (
                  <li key={content.id} className="glass-card flex flex-wrap items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={content.status} locale={locale} />
                        <span className="truncate text-sm font-medium">{content.title_bn}</span>
                      </div>
                    </div>
                    <WorkflowActions
                      status={content.status}
                      role={role}
                      locale={locale}
                      onAction={(a) => void runAction(content.id, a)}
                      disabled={busyId === content.id}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
