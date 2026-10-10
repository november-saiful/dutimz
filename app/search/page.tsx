import type { Metadata } from "next";

import { SearchResults } from "@/components/search/search-results";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";

export const metadata: Metadata = {
  title: "সংবাদ খুঁজুন",
  description: "ঢাকা বিশ্ববিদ্যালয়ের খবর, বিভাগ ও বিষয় খুঁজুন।",
  alternates: { canonical: "/search/" },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <DutimzShell title="কোন গল্পটি খুঁজছেন?" crumbs={[{ label: "খুঁজুন" }]}>
      <p className="max-w-2xl text-sm text-muted-foreground">
        শিরোনাম, বিষয় কিংবা সংবাদ বিভাগ লিখে খুঁজুন।
      </p>
      <SearchResults initialQuery={q ?? ""} />
    </DutimzShell>
  );
}
