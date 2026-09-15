export const runtime = "edge";

import type { Metadata } from "next";
import { SearchForm } from "@/components/content/SearchForm";
import { SearchResultList } from "@/components/content/SearchResultList";
import { searchContents } from "@/lib/content/search";

export const metadata: Metadata = {
  title: "খুঁজুন",
  robots: { index: false },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const query = searchParams.q ?? "";

  let results = null;
  if (query) {
    results = await searchContents(query);
  }

  return (
    <div className="container mt-10 max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">খুঁজুন</h1>
      <SearchForm initialQuery={query} />

      {query && results && (
        <div className="mt-8">
          <p className="mb-4 text-sm opacity-60">
            &ldquo;{query}&rdquo; — {results.total} টি ফলাফল পাওয়া গেছে
          </p>
          <SearchResultList items={results.items} query={query} />
        </div>
      )}
    </div>
  );
}
