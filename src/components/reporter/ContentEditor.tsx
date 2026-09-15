"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, Content } from "@/types";
import type { ContentRevisionWithEditor } from "@/types/workflow";
import type { WorkflowAction } from "@/lib/content/workflow";
import { RichTextEditor } from "@/components/reporter/RichTextEditor";
import { ThumbnailUploader } from "@/components/reporter/ThumbnailUploader";
import { StatusBadge, WorkflowActions } from "@/components/reporter/StatusBadge";
import { RevisionHistory } from "@/components/reporter/RevisionHistory";
import { useLocaleStore } from "@/stores/locale";
import { buildSlug, validateDraft, validateForPublish, type ValidationIssue } from "@/lib/content/validate";
import { estimateReadTime } from "@/lib/utils/format";

/**
 * Phase 3 content editor — the reporter's workspace.
 *  - dual Bangla / English lanes (Bangla is primary, per spec "Bangla first");
 *  - autosave (debounced) keeps drafts safe without a manual save button;
 *  - workflow actions run the server-side state machine via the PATCH API;
 *  - revision restore pulls a prior snapshot back into the form.
 */

interface Props {
  /** Existing content when editing; null when creating a new story. */
  initialContent?: Content | null;
  revisions?: ContentRevisionWithEditor[];
  categories: Category[];
  role: "reporter" | "moderator" | "admin";
}

const COPY = {
  bn: {
    newTitle: "নতুন লেখা",
    editTitle: "লেখা সম্পাদনা",
    sectionBangla: "বাংলা (প্রধান)",
    sectionEnglish: "ইংরেজি (ঐচ্ছিক)",
    titleBn: "শিরোনাম (বাংলা)",
    titleEn: "Title (English)",
    subtitleBn: "সাবটাইটেল (বাংলা)",
    subtitleEn: "Subtitle (English)",
    excerptBn: "সারসংক্ষেপ (বাংলা)",
    excerptEn: "Excerpt (English)",
    bodyBn: "মূল লেখা (বাংলা)",
    bodyEn: "Body (English)",
    slugLabel: "স্লাগ (SEO)",
    slugAuto: "ইংরেজি শিরোনাম থেকে স্বয়ংক্রিয়",
    type: "ধরন",
    category: "বিভাগ",
    tags: "ট্যাগ (কমা দিয়ে আলাদা)",
    video: "ভিডিও লিংক (YouTube/Vimeo)",
    saving: "সংরক্ষণ হচ্ছে…",
    saved: "সংরক্ষিত",
    unsaved: "অসংরক্ষিত পরিবর্তন",
    saveNow: "এখনই সংরক্ষণ",
    error: "সমস্যা হয়েছে — আবার চেষ্টা করুন।",
    issues: "সংশোধন করুন:",
    readTime: "পড়ার সময়",
    min: "মিনিট",
    restoreDone: "পুরোনো সংস্করণ ফিরিয়ে আনা হয়েছে — সংরক্ষণ করুন।",
    publishBlocked: "প্রকাশ সম্ভব নয় — নিচের সমস্যাগুলো দেখুন।",
    delete: "মুছে ফেলুন",
    deleteConfirm: "সত্যিই মুছে ফেলবেন?",
    note: "নোট (ঐচ্ছিক)",
    notePlaceholder: "পর্যালোচকের জন্য নোট…",
    autosaveOn: "স্বয়ংক্রিয় সংরক্ষণ চালু",
    backToList: "তালিকায় ফিরুন",
  },
  en: {
    newTitle: "New story",
    editTitle: "Edit story",
    sectionBangla: "Bangla (primary)",
    sectionEnglish: "English (optional)",
    titleBn: "Title (Bangla)",
    titleEn: "Title (English)",
    subtitleBn: "Subtitle (Bangla)",
    subtitleEn: "Subtitle (English)",
    excerptBn: "Excerpt (Bangla)",
    excerptEn: "Excerpt (English)",
    bodyBn: "Body (Bangla)",
    bodyEn: "Body (English)",
    slugLabel: "Slug (SEO)",
    slugAuto: "auto from English title",
    type: "Type",
    category: "Category",
    tags: "Tags (comma separated)",
    video: "Video link (YouTube/Vimeo)",
    saving: "Saving…",
    saved: "Saved",
    unsaved: "Unsaved changes",
    saveNow: "Save now",
    error: "Something went wrong — please retry.",
    issues: "Fix before continuing:",
    readTime: "Read time",
    min: "min",
    restoreDone: "Old version restored — remember to save.",
    publishBlocked: "Cannot publish yet — see the issues below.",
    delete: "Delete",
    deleteConfirm: "Really delete this draft?",
    note: "Note (optional)",
    notePlaceholder: "Note for the reviewer…",
    autosaveOn: "Autosave on",
    backToList: "Back to list",
  },
} as const;

interface FormState {
  title_bn: string;
  subtitle_bn: string;
  excerpt_bn: string;
  body_bn: string;
  title_en: string;
  subtitle_en: string;
  excerpt_en: string;
  body_en: string;
  thumbnail_url: string | null;
  thumbnail_alt: string;
  video_url: string;
  content_type: Content["content_type"];
  category_id: string | null;
  tags: string;
}

function toForm(content: Content | null | undefined): FormState {
  return {
    title_bn: content?.title_bn ?? "",
    subtitle_bn: content?.subtitle_bn ?? "",
    excerpt_bn: content?.excerpt_bn ?? "",
    body_bn: content?.body_bn ?? "",
    title_en: content?.title_en ?? "",
    subtitle_en: content?.subtitle_en ?? "",
    excerpt_en: content?.excerpt_en ?? "",
    body_en: content?.body_en ?? "",
    thumbnail_url: content?.thumbnail_url ?? null,
    thumbnail_alt: content?.thumbnail_alt ?? "",
    video_url: content?.video_url ?? "",
    content_type: content?.content_type ?? "news",
    category_id: content?.category_id ?? null,
    tags: (content?.tags ?? []).join(", "),
  };
}

const AUTOSAVE_MS = 4000;

export function ContentEditor({
  initialContent = null,
  revisions = [],
  categories,
  role,
}: Props) {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];

  const [content, setContent] = useState<Content | null>(initialContent);
  const [allRevisions, setAllRevisions] = useState<ContentRevisionWithEditor[]>(revisions);
  const [form, setForm] = useState<FormState>(() => toForm(initialContent));
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const [note, setNote] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [tempId] = useState(() => `new-${Date.now().toString(36)}`);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  dirtyRef.current = dirty;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setSaveState("idle");
  };

  const slug = useMemo(
    () => buildSlug(form.title_en, form.title_bn),
    [form.title_en, form.title_bn],
  );

  const draftInput = useMemo(
    () => ({
      title_bn: form.title_bn,
      body_bn: form.body_bn || null,
      title_en: form.title_en || null,
      body_en: form.body_en || null,
      content_type: form.content_type,
      content_format: form.content_type === "documentary" ? ("video" as const) : ("text" as const),
      thumbnail_url: form.thumbnail_url,
      video_url: form.video_url || null,
    }),
    [form],
  );

  const draftIssues = useMemo(() => validateDraft(draftInput), [draftInput]);
  const publishIssues = useMemo(() => validateForPublish(draftInput), [draftInput]);
  const readTime = estimateReadTime(form.body_bn || form.body_en || null);

  // ---- Save ---------------------------------------------------------------
  const save = useCallback(async (): Promise<Content | null> => {
    if (savingRef.current) return content;
    savingRef.current = true;
    setSaveState("saving");
    setActionError(null);

    const fields = {
      title_bn: form.title_bn.trim(),
      subtitle_bn: form.subtitle_bn.trim() || null,
      excerpt_bn: form.excerpt_bn.trim() || null,
      body_bn: form.body_bn || null,
      title_en: form.title_en.trim() || null,
      subtitle_en: form.subtitle_en.trim() || null,
      excerpt_en: form.excerpt_en.trim() || null,
      body_en: form.body_en || null,
      thumbnail_url: form.thumbnail_url,
      thumbnail_alt: form.thumbnail_alt.trim() || null,
      video_url: form.video_url.trim() || null,
      content_type: form.content_type,
      category_id: form.category_id,
      tags: form.tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    try {
      if (!content) {
        const res = await fetch("/api/reporter/contents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(fields),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "create failed");
        setContent(data.content as Content);
        setSaveState("saved");
        setDirty(false);
        // Swap the URL to the edit route without a navigation.
        window.history.replaceState(null, "", `/reporter/contents/${data.content.id}`);
        return data.content as Content;
      }

      const res = await fetch(`/api/reporter/contents/${content.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
      const saved = data.content as Content;
      setContent(saved);
      setSaveState("saved");
      setDirty(false);
      setNote("");
      // Refresh revision list quietly.
      void fetch(`/api/reporter/revisions?contentId=${saved.id}`)
        .then((r) => r.json())
        .then((d: { revisions?: ContentRevisionWithEditor[] }) => {
          if (d.revisions) setAllRevisions(d.revisions);
        })
        .catch(() => undefined);
      return saved;
    } catch {
      setSaveState("error");
      setActionError(t.error);
      return null;
    } finally {
      savingRef.current = false;
    }
  }, [content, form, note, t.error]);

  // Autosave: 4s after the last edit, only when dirty and draft-ish.
  useEffect(() => {
    if (!dirty) return;
    if (content && !["draft", "rejected"].includes(content.status) && role === "reporter") {
      return; // published/pending stories need an explicit save → re-review.
    }
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dirty]);

  // ---- Workflow actions ----------------------------------------------------
  async function runAction(action: WorkflowAction) {
    setActionError(null);
    setIssues(null);

    // Client-side pre-check for live transitions (fast feedback).
    if (["approve", "publish"].includes(action) && publishIssues.length > 0) {
      setIssues(publishIssues);
      setActionError(t.publishBlocked);
      return;
    }

    let saved = content;
    if (dirty || !content) {
      saved = await save();
      if (!saved) return;
    }
    const target = saved ?? content;
    if (!target) return;

    const res = await fetch(`/api/reporter/contents/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, note: note || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionError(String(data.error ?? t.error));
      if (Array.isArray(data.issues)) setIssues(data.issues as ValidationIssue[]);
      return;
    }
    setContent(data.content as Content);
    setDirty(false);
    setNote("");
    router.refresh();
    if (action === "submit") router.push("/reporter");
    if (action === "approve" || action === "publish") router.push("/reporter?published=1");
  }

  // ---- Revision restore ----------------------------------------------------
  async function restoreVersion(version: number) {
    if (!content) return;
    setRestoring(true);
    try {
      const res = await fetch(
        `/api/reporter/revisions?contentId=${content.id}&version=${version}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "restore failed");
      const fields = (data.revision?.changes?.snapshot?.fields ?? {}) as Record<string, unknown>;

      setForm((f) => ({
        ...f,
        title_bn: (fields.title_bn as string) ?? f.title_bn,
        subtitle_bn: (fields.subtitle_bn as string) ?? f.subtitle_bn,
        excerpt_bn: (fields.excerpt_bn as string) ?? f.excerpt_bn,
        body_bn: (fields.body_bn as string) ?? f.body_bn,
        title_en: (fields.title_en as string) ?? f.title_en,
        subtitle_en: (fields.subtitle_en as string) ?? f.subtitle_en,
        excerpt_en: (fields.excerpt_en as string) ?? f.excerpt_en,
        body_en: (fields.body_en as string) ?? f.body_en,
        thumbnail_url: (fields.thumbnail_url as string | null) ?? f.thumbnail_url,
        category_id: (fields.category_id as string | null) ?? f.category_id,
      }));
      setActionError(null);
      setSaveState("idle");
      setDirty(true);
      // Force a new revision on save so restore is never destructive.
      await save();
      setSaveState("saved");
      // Reload the page's editor payload so the restored state is canonical.
      router.refresh();
    } catch {
      setActionError(t.error);
    } finally {
      setRestoring(false);
    }
  }

  async function handleDelete() {
    if (!content) return;
    if (!window.confirm(t.deleteConfirm)) return;
    const res = await fetch(`/api/reporter/contents/${content.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/reporter");
      router.refresh();
    }
  }

  const status = content?.status ?? "draft";
  const isBangla = locale !== "en";
  const inputClass =
    "w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-400 focus:border-[var(--md-sys-color-primary)] dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <div className="flex flex-col gap-6" data-testid="content-editor">
      {/* Header: title, status, save state */}
      <div className="glass-card flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">
              {content ? t.editTitle : t.newTitle}
            </h1>
            <StatusBadge status={status} locale={locale} />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span
              role="status"
              className={
                saveState === "saved"
                  ? "opacity-60"
                  : saveState === "error"
                    ? "font-bold"
                    : "opacity-80"
              }
              style={saveState === "error" ? { color: "var(--color-error, #ea4335)" } : undefined}
            >
              {saveState === "saving"
                ? t.saving
                : saveState === "saved"
                  ? t.saved
                  : dirty
                    ? t.unsaved
                    : t.autosaveOn}
            </span>
            {(dirty || saveState === "error") && (
              <button
                type="button"
                onClick={() => void save()}
                disabled={saveState === "saving"}
                className="rounded-full px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                style={{ background: "var(--md-sys-color-primary)" }}
              >
                {t.saveNow}
              </button>
            )}
          </div>
        </div>
        {content && (
          <div className="flex flex-wrap items-center gap-2 text-xs opacity-60">
            <StatusBadge status={status} locale={locale} />
            <span>v{content.version}</span>
            {content.published_at && (
              <span>· {new Date(content.published_at).toLocaleString(isBangla ? "bn-BD" : "en-GB")}</span>
            )}
          </div>
        )}
        <WorkflowActions
          status={status}
          role={role}
          locale={locale}
          onAction={(a) => void runAction(a)}
          disabled={saveState === "saving"}
        />
        {actionError && (
          <p role="alert" className="text-sm" style={{ color: "var(--color-error, #ea4335)" }}>
            {actionError}
          </p>
        )}
        {issues && issues.length > 0 && (
          <ul
            className="list-inside list-disc rounded-xl px-4 py-2 text-sm"
            style={{
              background: "rgba(234, 67, 53, 0.08)",
              color: "var(--color-error, #ea4335)",
            }}
          >
            {issues.map((issue, i) => (
              <li key={`${issue.field}-${i}`}>{isBangla ? issue.message_bn : issue.message_en}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Bangla lane */}
      <div className="glass-card flex flex-col gap-4 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide opacity-60">
          {t.sectionBangla}
        </h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ce-title-bn" className="text-xs font-bold opacity-70">
            {t.titleBn} *
          </label>
          <input
            id="ce-title-bn"
            type="text"
            lang="bn"
            required
            value={form.title_bn}
            onChange={(e) => set("title_bn", e.target.value)}
            className={`${inputClass} text-lg font-bold`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ce-sub-bn" className="text-xs font-bold opacity-70">
              {t.subtitleBn}
            </label>
            <input
              id="ce-sub-bn"
              type="text"
              lang="bn"
              value={form.subtitle_bn}
              onChange={(e) => set("subtitle_bn", e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ce-excerpt-bn" className="text-xs font-bold opacity-70">
              {t.excerptBn}
            </label>
            <textarea
              id="ce-excerpt-bn"
              rows={2}
              lang="bn"
              value={form.excerpt_bn}
              onChange={(e) => set("excerpt_bn", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <RichTextEditor
          label={t.bodyBn}
          lang="bn"
          value={form.body_bn}
          onChange={(html) => set("body_bn", html)}
          placeholder="লেখা শুরু করুন…"
        />
        <p className="text-xs opacity-50">
          {t.readTime}: {readTime} {t.min}
        </p>
      </div>

      {/* English lane */}
      <details className="glass-card p-5" open={Boolean(form.title_en || form.body_en)}>
        <summary className="cursor-pointer text-sm font-bold uppercase tracking-wide opacity-60">
          {t.sectionEnglish}
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ce-title-en" className="text-xs font-bold opacity-70">
              {t.titleEn}
            </label>
            <input
              id="ce-title-en"
              type="text"
              dir="ltr"
              value={form.title_en}
              onChange={(e) => set("title_en", e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ce-sub-en" className="text-xs font-bold opacity-70">
                {t.subtitleEn}
              </label>
              <input
                id="ce-sub-en"
                dir="ltr"
                type="text"
                value={form.subtitle_en}
                onChange={(e) => set("subtitle_en", e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ce-excerpt-en" className="text-xs font-bold opacity-70">
                {t.excerptEn}
              </label>
              <textarea
                id="ce-excerpt-en"
                dir="ltr"
                rows={2}
                value={form.excerpt_en}
                onChange={(e) => set("excerpt_en", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <RichTextEditor
            label={t.bodyEn}
            lang="en"
            value={form.body_en}
            onChange={(html) => set("body_en", html)}
            placeholder="Start writing…"
          />
        </div>
      </details>

      {/* Meta: thumbnail, type, category, tags */}
      <div className="glass-card grid gap-6 p-5 md:grid-cols-2">
        <ThumbnailUploader
          contentId={content?.id ?? tempId}
          url={form.thumbnail_url}
          alt={form.thumbnail_alt || null}
          onUploaded={(url) => set("thumbnail_url", url)}
          onAltChange={(alt) => set("thumbnail_alt", alt)}
          onRemove={() => set("thumbnail_url", null)}
          disabled={false}
        />

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ce-type" className="text-xs font-bold opacity-70">
                {t.type}
              </label>
              <select
                id="ce-type"
                value={form.content_type}
                onChange={(e) => set("content_type", e.target.value as FormState["content_type"])}
                className={inputClass}
              >
                <option value="news">{isBangla ? "সংবাদ" : "News"}</option>
                <option value="article">{isBangla ? "নিবন্ধ" : "Article"}</option>
                <option value="documentary">{isBangla ? "ডকুমেন্টারি" : "Documentary"}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ce-category" className="text-xs font-bold opacity-70">
                {t.category}
              </label>
              <select
                id="ce-category"
                value={form.category_id ?? ""}
                onChange={(e) => set("category_id", e.target.value || null)}
                className={inputClass}
              >
                <option value="">—</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {isBangla ? cat.name_bn : cat.name_en}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ce-tags" className="text-xs font-bold opacity-70">
              {t.tags}
            </label>
            <input
              id="ce-tags"
              type="text"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              className={inputClass}
              placeholder="campus, election"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ce-video" className="text-xs font-bold opacity-70">
              {t.video}
            </label>
            <input
              id="ce-video"
              type="url"
              dir="ltr"
              value={form.video_url}
              onChange={(e) => set("video_url", e.target.value)}
              className={inputClass}
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ce-slug" className="text-xs font-bold opacity-70">
              {t.slugLabel}
            </label>
            <input
              id="ce-slug"
              type="text"
              dir="ltr"
              readOnly
              value={content?.slug ?? slug}
              className={`${inputClass} opacity-70`}
            />
            <p className="text-xs opacity-40">{t.slugAuto}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ce-note" className="text-xs font-bold opacity-70">
              {t.note}
            </label>
            <input
              id="ce-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.notePlaceholder}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Revision history */}
      {content && (
        <div className="glass-card p-5">
          <RevisionHistory
            contentId={content.id}
            revisions={allRevisions}
            currentVersion={content.version}
            onRestore={(v) => void restoreVersion(v)}
            restoring={restoring}
          />
        </div>
      )}

      {/* Danger zone */}
      {content && ["draft", "rejected"].includes(content.status) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="rounded-full px-4 py-2 text-sm font-bold underline"
            style={{ color: "var(--color-error, #ea4335)" }}
          >
            {t.delete}
          </button>
        </div>
      )}
    </div>
  );
}
