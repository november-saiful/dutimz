"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function SearchForm({ initialQuery }: { initialQuery: string }) {
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
        খুঁজুন
      </label>
      <input
        id="site-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="কীওয়ার্ড লিখুন…"
        className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-3 text-sm outline-none focus:border-[var(--md-sys-color-primary)] dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        className="rounded-full px-6 py-3 text-sm font-bold text-white"
        style={{ background: "var(--md-sys-color-primary)" }}
      >
        খুঁজুন
      </button>
    </form>
  );
}
