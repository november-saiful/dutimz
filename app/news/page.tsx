import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { NewsArchive } from "@/components/news/news-archive";
import {
  getLatestStories,
  getNavCategories,
  getPublishedArticleCount,
} from "@/lib/stories";

/*
  The archive, as one address.

  Until this page existed "every report" was `/search/` with an empty query — an
  accidental collection that could only be read newest-first. This one is the
  deliberate front door: the newest page is prerendered with the page, and the
  reader can then narrow by desk or period and reorder. Nothing reader-specific
  is rendered here, so it is cached and revalidated with the rest of the reading
  surfaces.
*/
export const revalidate = 600;

export const metadata: Metadata = {
  title: "সব সংবাদ",
  description:
    "ঢাকা বিশ্ববিদ্যালয়ের সব বিভাগের প্রকাশিত প্রতিবেদন এক জায়গায় — বিভাগ ও সময় অনুযায়ী দেখুন, নতুন বা পুরোনো আগে সাজান।",
  alternates: { canonical: "/news/" },
};

export default async function NewsIndexPage() {
  const [sections, stories, total] = await Promise.all([
    getNavCategories(),
    getLatestStories(24),
    getPublishedArticleCount(),
  ]);

  return (
    <DutimzShell title="সব সংবাদ" crumbs={[{ label: "সংবাদ" }]}>
      <p className="max-w-2xl text-sm text-muted-foreground">
        সব বিভাগের প্রকাশিত প্রতিবেদন এক জায়গায়। বিভাগ ও সময় বেছে নিন, আর
        প্রকাশের ক্রম অনুযায়ী সাজিয়ে পড়ুন।
      </p>
      <NewsArchive
        sections={sections}
        initialStories={stories}
        initialTotal={total}
      />
    </DutimzShell>
  );
}
