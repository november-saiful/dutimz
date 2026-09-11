import type { Metadata } from "next";
import { SearchForm } from "@/components/content/SearchForm";
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
  return (
    <div className="container mt-10 max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">
        {locale === "bn" ? "খুঁজুন" : "Search"}
      </h1>
      <SearchForm initialQuery={searchParams.q ?? ""} locale={locale} />
      {searchParams.q && (
        <p className="mt-6 text-sm opacity-60">
          {locale === "bn"
            ? `ফুল-টেক্সট সার্চ ইঞ্জিন Phase 4-এ যুক্ত হবে — এখনকার ফলাফল শূন্য।`
            : `Full-text search arrives in Phase 4 — no results yet.`}
        </p>
      )}
    </div>
  );
}
