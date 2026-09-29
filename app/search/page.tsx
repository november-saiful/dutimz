import type { Metadata } from "next";

import { SearchResults } from "@/components/search/search-results";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            DUTIMZ আর্কাইভ
          </p>
          <CardTitle className="text-2xl">কোন গল্পটি খুঁজছেন?</CardTitle>
          <CardDescription>
            শিরোনাম, বিষয় কিংবা সংবাদ বিভাগ লিখে খুঁজুন।
          </CardDescription>
        </CardHeader>
      </Card>
      <SearchResults initialQuery={q ?? ""} />
    </DutimzShell>
  );
}
