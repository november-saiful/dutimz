import type { Metadata } from "next";
import * as React from "react";

import { SpotlightForum } from "@/components/forum/spotlight-forum";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/*
  Cached shell: the forum list loads client-side with its own fresh fetch, so
  caching this shell costs no freshness and serves readers from the R2 page cache.

  An hour rather than a minute: the forum list is fetched client-side, so a shorter window only
  bought background regenerations of a page whose HTML never changes (see open-next.config.ts).
*/
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "স্পটলাইট",
  description: "যেকোনো ইস্যু নিয়ে সদস্যদের পোস্ট ও আলোচনার জায়গা।",
  alternates: { canonical: "/spotlight/" },
};

export default function SpotlightPage() {
  return (
    <DutimzShell title="স্পটলাইট" crumbs={[{ label: "স্পটলাইট" }]}>
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            সদস্যদের কণ্ঠ
          </p>
          <CardTitle className="text-2xl">স্পটলাইট</CardTitle>
          <CardDescription>
            যেকোনো ইস্যু নিয়ে শিরোনাম, বিবরণ ও ছবিসহ পোস্ট করুন — সব লগইন করা
            সদস্য এখানে লিখতে পারেন।
          </CardDescription>
        </CardHeader>
      </Card>
      {/* Suspense boundary for the forum's `useSearchParams` deep-link
          (`?compose=1` from the phone dock's create action). */}
      <React.Suspense>
        <SpotlightForum />
      </React.Suspense>
    </DutimzShell>
  );
}
