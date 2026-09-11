"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function SearchForm({
  initialQuery,
  locale,
}: {
  initialQuery: string;
  locale: "bn" | "en";
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed) router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={onSubmit} role="search" className="flex gap-3">
      <label htmlFor="site-search" className="sr-only">
        {locale === "bn" ? "খুঁজুন" : "Search"}
      </label>
      <input
        id="site-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={locale === "bn" ? "কীওয়ার্ড লিখুন…" : "Type keywords…"}
        className="flex-1 rounded-full border border-white/40 bg-white/60 px-5 py-3 text-sm outline-none focus:border-primary dark:bg-black/40"
      />
      <button
        type="submit"
        className="rounded-full px-6 py-3 text-sm font-bold text-white"
        style={{ background: "var(--md-sys-color-primary)" }}
      >
        {locale === "bn" ? "খুঁজুন" : "Search"}
      </button>
    </form>
  );
}
