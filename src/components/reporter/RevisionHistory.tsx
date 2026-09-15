"use client";

import { useEffect, useState } from "react";
import type { ContentRevisionWithEditor } from "@/types";
import { describeRevision, revisionPreview } from "@/lib/content/revisions";
import { useLocaleStore } from "@/stores/locale";
import { formatCount } from "@/lib/utils/format";

/**
 * Revision history panel (Phase 3): lists every revision of a story with
 * editor, version, changed fields, moderator notes and a restore action.
 */

interface Props {
  contentId: string;
  revisions: ContentRevisionWithEditor[];
  currentVersion: number;
  onRestore: (version: number) => void;
  restoring?: boolean;
}

const COPY = {
  bn: {
    heading: "সংশোধন ইতিহাস",
    empty: "কোনো সংশোধন নেই।",
    restore: "এই সংস্করণে ফিরুন",
    confirmRestore: "নিশ্চিত? আবার চাপ দিলে ফিরিয়ে আনা হবে।",
    restoring: "ফিরিয়ে আনা হচ্ছে…",
    current: "বর্তমান",
    noteLabel: "নোট",
    preview: "প্রিভিউ",
    hidePreview: "প্রিভিউ বন্ধ",
    previewUnavailable: "প্রিভিউ পাওয়া যায়নি।",
  },
  en: {
    heading: "Revision history",
    empty: "No revisions yet.",
    restore: "Restore this version",
    confirmRestore: "Sure? Click again to restore.",
    restoring: "Restoring…",
    current: "Current",
    noteLabel: "Note",
    preview: "Preview",
    hidePreview: "Hide preview",
    previewUnavailable: "Preview unavailable.",
  },
} as const;

export function RevisionHistory({
  contentId,
  revisions,
  currentVersion,
  onRestore,
  restoring = false,
}: Props) {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];
  const [confirming, setConfirming] = useState<number | null>(null);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [previewBody, setPreviewBody] = useState<string>("");

  // Lazy-load the selected revision body from the revisions API.
  useEffect(() => {
    if (previewVersion === null) return;
    let cancelled = false;
    setPreviewBody("");
    void (async () => {
      try {
        const res = await fetch(
          `/api/reporter/revisions?contentId=${contentId}&version=${previewVersion}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { body?: string };
        if (!cancelled) setPreviewBody(data.body ?? "");
      } catch {
        /* preview is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewVersion, contentId]);

  if (revisions.length === 0) {
    return (
      <p className="text-sm opacity-60" data-testid="revision-history-empty">
        {t.empty}
      </p>
    );
  }

  return (
    <section aria-label={t.heading} data-testid="revision-history">
      <h3 className="mb-3 text-sm font-bold">{t.heading}</h3>
      <ol className="flex flex-col gap-2">
        {revisions.map((rev) => {
          const isCurrent = rev.version === currentVersion;
          const description = describeRevision(rev, locale);
          return (
            <li
              key={rev.id}
              className="rounded-xl border border-neutral-200 bg-white/50 px-4 py-3 text-sm dark:border-neutral-700 dark:bg-black/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white"
                    style={{ background: "var(--md-sys-color-primary)" }}
                  >
                    v{formatCount(rev.version, locale)}
                  </span>
                  <span className="font-medium">
                    {rev.editor?.display_name ?? rev.editor?.username ?? "—"}
                  </span>
                  {isCurrent && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-bold"
                      style={{
                        background: "var(--md-sys-color-primary-container)",
                        color: "var(--md-sys-color-on-primary-container)",
                      }}
                    >
                      {t.current}
                    </span>
                  )}
                </div>
                <time className="text-xs opacity-60" dateTime={rev.created_at}>
                  {new Date(rev.created_at).toLocaleString(
                    locale === "bn" ? "bn-BD" : "en-GB",
                    { dateStyle: "medium", timeStyle: "short" },
                  )}
                </time>
              </div>

              {description && (
                <p className="mt-1.5 text-xs opacity-70">{description}</p>
              )}
              {rev.changes?.note ? (
                <p
                  className="mt-1.5 rounded-lg px-2.5 py-1.5 text-xs"
                  style={{
                    background: "var(--md-sys-color-primary-container)",
                    color: "var(--md-sys-color-on-primary-container)",
                  }}
                >
                  💬 {String(rev.changes.note)}
                </p>
              ) : null}

              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs font-bold underline opacity-80 hover:opacity-100"
                  onClick={() =>
                    setPreviewVersion((p) => (p === rev.version ? null : rev.version))
                  }
                >
                  {previewVersion === rev.version ? t.hidePreview : t.preview}
                </button>
                {!isCurrent && (
                  <button
                    type="button"
                    disabled={restoring}
                    className="text-xs font-bold underline disabled:opacity-50"
                    style={{ color: "var(--md-sys-color-primary)" }}
                    onClick={() => {
                      if (confirming === rev.version) {
                        setConfirming(null);
                        onRestore(rev.version);
                      } else {
                        setConfirming(rev.version);
                      }
                    }}
                    title={confirming === rev.version ? t.confirmRestore : undefined}
                  >
                    {restoring ? t.restoring : t.restore}
                  </button>
                )}
              </div>

              {previewVersion === rev.version && (
                <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/[0.04] px-3 py-2 text-xs opacity-80 dark:bg-white/5">
                  {previewBody || t.previewUnavailable}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
