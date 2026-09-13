"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ContentWithRelations } from "@/types";

interface Props {
  items: ContentWithRelations[];
}

export function HeroSection({ items }: Props) {
  const [index, setIndex] = useState(0);
  const count = items.length;

  const go = useCallback(
    (dir: 1 | -1) => {
      if (count > 0) setIndex((i) => (i + dir + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (count <= 1) return;
    const timer = setInterval(() => go(1), 6000);
    return () => clearInterval(timer);
  }, [count, go]);

  if (count === 0) return null;
  const active = items[Math.min(index, count - 1)]!;
  const title = active.title_bn;
  const excerpt = active.excerpt_bn;
  const href =
    active.content_type === "news"
      ? `/news/${active.slug}`
      : active.content_type === "article"
        ? `/articles/${active.slug}`
        : `/documentaries/${active.slug}`;

  return (
    <section aria-label="বৈশিষ্ট্য সংবাদ" className="container mt-6">
      <div className="relative aspect-[16/8] w-full overflow-hidden rounded-glass md:aspect-[16/7]">
        {active.thumbnail_url && (
          <Image
            src={active.thumbnail_url}
            alt={active.thumbnail_alt ?? title}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-5 md:p-10">
          {active.category && (
            <span
              className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: "var(--md-sys-color-primary)", color: "#fff" }}
            >
              {active.category.name_bn}
            </span>
          )}
          <h1 className="max-w-3xl text-2xl font-bold leading-tight text-white md:text-4xl">
            <Link href={href}>{title}</Link>
          </h1>
          {excerpt && (
            <p className="mt-2 hidden max-w-2xl text-sm text-white/85 md:line-clamp-2 md:block">
              {excerpt}
            </p>
          )}
          <p className="mt-2 text-xs text-white/70">
            {active.published_at &&
              new Date(active.published_at).toLocaleDateString("bn-BD")}
          </p>
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur hover:bg-black/60"
              aria-label="আগের স্লাইড"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur hover:bg-black/60"
              aria-label="পরের স্লাইড"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
            <div className="absolute bottom-3 right-4 flex gap-1.5">
              {items.map((it, i) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`স্লাইড ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-1.5 bg-white/50"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
