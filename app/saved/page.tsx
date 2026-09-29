import type { Metadata } from "next";

import { SavedStories } from "@/components/account/saved-stories";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "সংরক্ষিত প্রতিবেদন",
  description: "পরে পড়ার জন্য সংরক্ষিত ঢাকা বিশ্ববিদ্যালয়ের প্রতিবেদন।",
  alternates: { canonical: "/saved/" },
};

export default function SavedPage() {
  return (
    <DutimzShell title="সংরক্ষিত প্রতিবেদন" crumbs={[{ label: "সংরক্ষিত" }]}>
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            আপনার পড়ার তালিকা
          </p>
          <CardTitle className="text-2xl">সংরক্ষিত প্রতিবেদন</CardTitle>
          <CardDescription>
            যে খবরগুলো পরে পড়বেন বলে রেখেছেন।
          </CardDescription>
        </CardHeader>
      </Card>
      <SavedStories />
    </DutimzShell>
  );
}
