"use client";

import { useRef, useState, type DragEvent } from "react";
import { useLocaleStore } from "@/stores/locale";
import {
  THUMBNAIL_RULES,
  ThumbnailUploadError,
  uploadThumbnail,
} from "@/lib/upload/image";

/**
 * Thumbnail uploader (Phase 3): drag & drop or file picker → client-side
 * WebP compression → Supabase Storage (data-URL fallback in mock mode).
 * Shows the compressed size so reporters see the optimization working.
 */

interface Props {
  contentId: string;
  url: string | null;
  alt: string | null;
  onUploaded: (url: string, alt?: string) => void;
  onAltChange: (alt: string) => void;
  onRemove: () => void;
  disabled?: boolean;
}

const COPY = {
  bn: {
    label: "থাম্বনেইল ছবি",
    drop: "ছবি টেনে আনুন বা ক্লিক করে বেছে নিন",
    hint: "JPEG · PNG · WebP · সর্বোচ্চ ৮MB — স্বয়ংক্রিয়ভাবে WebP-তে কমপ্রেস হয়",
    uploading: "প্রসেস হচ্ছে…",
    replace: "বদলান",
    remove: "সরান",
    altLabel: "ছবির ক্যাপশন / alt",
    compressed: "কমপ্রেসড",
    required: "প্রকাশের আগে থাম্বনেইল আবশ্যক",
  },
  en: {
    label: "Thumbnail image",
    drop: "Drag an image here, or click to browse",
    hint: "JPEG · PNG · WebP · up to 8MB — auto-compressed to WebP",
    uploading: "Processing…",
    replace: "Replace",
    remove: "Remove",
    altLabel: "Image caption / alt",
    compressed: "compressed",
    required: "Thumbnail required before publish",
  },
} as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ThumbnailUploader({
  contentId,
  url,
  alt,
  onUploaded,
  onAltChange,
  onRemove,
  disabled = false,
}: Props) {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file || disabled) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await uploadThumbnail(file, contentId);
      onUploaded(result.url);
      setInfo(
        locale === "bn"
          ? `${formatBytes(result.bytes)} · ${result.width}×${result.height}`
          : `${formatBytes(result.bytes)} ${t.compressed} · ${result.width}×${result.height}`,
      );
    } catch (err) {
      const message =
        err instanceof ThumbnailUploadError
          ? err.message
          : locale === "bn"
            ? "আপলোড ব্যর্থ হয়েছে।"
            : "Upload failed.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    void handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="thumbnail-uploader">
      <label className="text-xs font-bold opacity-70">{t.label}</label>

      {url ? (
        <div className="overflow-hidden rounded-xl border border-white/40">
          <div className="relative aspect-video bg-black/5 dark:bg-white/5">
            {/* Data-URL / Storage URL — plain img covers both. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={alt ?? ""} className="h-full w-full object-cover" />
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-xs opacity-60">{info ?? (alt || "—")}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => inputRef.current?.click()}
                className="rounded-full px-3 py-1 text-xs font-bold hover:bg-black/5 dark:hover:bg-white/10"
              >
                {t.replace}
              </button>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={onRemove}
                className="rounded-full px-3 py-1 text-xs font-bold"
                style={{ color: "var(--color-error, #ea4335)" }}
              >
                {t.remove}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          aria-disabled={disabled || busy}
          className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            dragOver ? "border-primary bg-black/5 dark:bg-white/10" : "border-white/50"
          } ${disabled || busy ? "opacity-50" : "hover:bg-black/[0.03] dark:hover:bg-white/5"}`}
        >
          <span className="text-2xl" aria-hidden="true">
            🖼️
          </span>
          <span className="text-sm font-medium">
            {busy ? t.uploading : t.drop}
          </span>
          <span className="text-xs opacity-50">{t.hint}</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={THUMBNAIL_RULES.accept.join(",")}
        hidden
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--color-error, #ea4335)" }}>
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="thumb-alt" className="text-xs font-bold opacity-70">
          {t.altLabel}
        </label>
        <input
          id="thumb-alt"
          type="text"
          value={alt ?? ""}
          onChange={(e) => onAltChange(e.target.value)}
          disabled={disabled}
          className="w-full rounded-xl border border-white/40 bg-white/60 px-4 py-2 text-sm outline-none placeholder:opacity-50 dark:bg-black/40"
        />
        {!url && <p className="text-xs opacity-40">{t.required}</p>}
      </div>
    </div>
  );
}
