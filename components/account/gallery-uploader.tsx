"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { errorMessage } from "@/lib/errors";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
const MAX_FILES = 10;
const MAX_BYTES = 20 * 1024 * 1024;

export type GalleryItem = { id: string; objectUrl: string; name: string };

function mediaBase(): string {
  const configured = process.env.NEXT_PUBLIC_MEDIA_URL ?? "";
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location.hostname === "localhost")
    return "http://localhost:8788";
  return "https://media.dutimz.com";
}

export function GalleryUploader({
  items,
  onChange,
}: {
  items: GalleryItem[];
  onChange: (items: GalleryItem[]) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function uploadOne(file: File): Promise<GalleryItem> {
    // The media Worker reads the raw body with Content-Type + bearer token —
    // same contract the old editor used. HEIC is rejected server-side (415).
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    );
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) throw new Error("ছবি পাঠাতে আগে গুগল দিয়ে প্রবেশ করুন।");
    const response = await fetch(`${mediaBase()}/upload`, {
      method: "POST",
      headers: {
        "Content-Type": file.type,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: file,
    });
    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      error?: string;
    } | null;
    if (!response.ok) {
      throw new Error(
        payload?.error ?? `মিডিয়া সার্ভার থেকে ${response.status} ত্রুটি এসেছে`,
      );
    }
    if (!payload?.id) throw new Error("ছবির আইডি পাওয়া যায়নি।");
    return {
      id: payload.id,
      objectUrl: URL.createObjectURL(file),
      name: file.name,
    };
  }

  async function onFiles(files: FileList | null) {
    setError("");
    if (!files?.length) return;
    const picked = [...files].slice(0, MAX_FILES - items.length);
    if (items.length + files.length > MAX_FILES) {
      setError(`একটি প্রতিবেদনে সর্বোচ্চ ${MAX_FILES}টি ছবি যুক্ত করা যায়।`);
    }
    for (const file of picked) {
      if (file.size > MAX_BYTES) {
        setError(`“${file.name}” সর্বোচ্চ ২০ MB হতে পারে।`);
        continue;
      }
      setBusy(true);
      try {
        const item = await uploadOne(file);
        onChange([...itemsRef.current, item]);
      } catch (err) {
        setError(
          errorMessage(
            "gallery upload",
            err,
            "ছবি আপলোড করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
      } finally {
        setBusy(false);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  function move(index: number, delta: -1 | 1) {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  function remove(index: number) {
    const item = items[index];
    if (item) URL.revokeObjectURL(item.objectUrl);
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <Field
      label="ছবি (ঐচ্ছিক) — প্রথম ছবিটিই প্রচ্ছদ হবে"
      htmlFor="write-gallery"
      hint={`সর্বোচ্চ ${MAX_FILES}টি, প্রতিটি সর্বোচ্চ ২০ MB (JPEG, PNG, WebP, GIF, AVIF)। HEIC/HEIF সমর্থিত নয়।`}
      wide
    >
      <input
        ref={inputRef}
        id="write-gallery"
        type="file"
        accept={ACCEPT}
        multiple
        disabled={busy || items.length >= MAX_FILES}
        onChange={(e) => void onFiles(e.target.files)}
        className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
      />
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((item, index) => (
            <figure
              key={item.id}
              className="relative overflow-hidden rounded-md border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.objectUrl}
                alt={item.name}
                className="h-24 w-full object-cover"
              />
              {index === 0 && (
                <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                  প্রচ্ছদ
                </span>
              )}
              <div className="absolute bottom-1 right-1 flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="size-7"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="আগে নিন"
                >
                  <ArrowLeft className="size-3" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="size-7"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label="পরে নিন"
                >
                  <ArrowRight className="size-3" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="size-7"
                  onClick={() => remove(index)}
                  aria-label="সরান"
                >
                  <X className="size-3" />
                </Button>
              </div>
            </figure>
          ))}
        </div>
      )}
      {busy && (
        <p className="text-xs text-muted-foreground">ছবি আপলোড হচ্ছে…</p>
      )}
      {error && <FormMessage>{error}</FormMessage>}
    </Field>
  );
}
