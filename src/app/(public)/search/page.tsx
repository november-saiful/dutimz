import type { Metadata } from "next";
import { SearchForm } from "@/components/content/SearchForm";
import { SearchResultList } from "@/components/content/SearchResultList";
import { searchContents } from "@/lib/content/search";
import { getLocaleServer } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const locale = await getLocaleServer();
  const query = searchParams.q ?? "";

  let results = null;
  if (query) {
    results = await searchContents(query);
  }

  return (
    <div className="container mt-10 max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">
        {locale === "bn" ? "খুঁজুন" : "Search"}
      </h1>
      <SearchForm initialQuery={query} locale={locale} />

      {query && results && (
        <div className="mt-8">
          <p className="mb-4 text-sm opacity-60">
            {locale === "bn"
              ? `"${query}" — ${results.total} টি ফলাফল পাওয়া গেছে`
              : `"${query}" — ${results.total} result${results.total !== 1 ? "s" : ""} found`}
          </p>
          <SearchResultList items={results.items} locale={locale} />
        </div>
      )}
    </div>
  );
}
