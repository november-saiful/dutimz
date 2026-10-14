import type { Metadata } from "next";

import { SearchResults } from "@/components/search/search-results";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { CATEGORIES } from "@/lib/site";

export const metadata: Metadata = {
  title: "সংবাদ খুঁজুন",
  description: "ঢাকা বিশ্ববিদ্যালয়ের খবর, বিভাগ ও বিষয় খুঁজুন।",
  alternates: { canonical: "/search/" },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; desk?: string }>;
}) {
  const { q, desk } = await searchParams;
  // Unknown desk slugs fall back to the whole archive rather than an empty page.
  const initialDesk = CATEGORIES.some(
    (category) => category.slug !== "all" && category.slug === desk,
  )
    ? (desk as string)
    : null;
  return (
    <DutimzShell title="কোন গল্পটি খুঁজছেন?" crumbs={[{ label: "খুঁজুন" }]}>
      <p className="max-w-2xl text-sm text-muted-foreground">
        শিরোনাম, বিষয় কিংবা সংবাদ বিভাগ লিখে খুঁজুন।
      </p>
      <SearchResults initialQuery={q ?? ""} initialDesk={initialDesk} />
    </DutimzShell>
  );
}
