import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { PublicStats } from "@/components/statistics/public-stats";
import { SpotlightStats } from "@/components/statistics/spotlight-stats";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "কার্যক্রমের পরিসংখ্যান",
  description:
    "প্রকাশিত প্রতিবেদনের তথ্য থেকে তৈরি ক্যাম্পাস কার্যক্রমের পরিচয়বিহীন সামগ্রিক পরিসংখ্যান।",
  alternates: { canonical: "/statistics/" },
};

export default function StatisticsPage() {
  return (
    <DutimzShell title="কার্যক্রমের পরিসংখ্যান" crumbs={[{ label: "পরিসংখ্যান" }]}>
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            তথ্যভিত্তিক ক্যাম্পাস
          </p>
          <CardTitle className="text-3xl">কার্যক্রমের পরিসংখ্যান</CardTitle>
          <CardDescription>
            প্রকাশিত প্রতিবেদনে দেওয়া শ্রেণিভিত্তিক তথ্যের সামগ্রিক চিত্র। এই
            পাতায় কোনো ব্যক্তি বা পরিচয়-সংক্রান্ত তথ্য প্রকাশ করা হয় না।
          </CardDescription>
        </CardHeader>
      </Card>
      <PublicStats />
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            জবাবদিহি
          </p>
          <CardTitle className="text-2xl">স্পটলাইটের ইস্যু</CardTitle>
          <CardDescription>
            স্পটলাইটে তোলা ইস্যুগুলোর কতটি সমাধান হয়েছে, কে সমাধান করেছে
            এবং কতগুলো ভিত্তিহীন — সব এক জায়গায়।
          </CardDescription>
        </CardHeader>
      </Card>
      <SpotlightStats />
      <p className="text-xs text-muted-foreground">
        পরিসংখ্যানে শুধু প্রকাশিত প্রতিবেদনের সমষ্টিগত সংখ্যা দেখানো হয়।
        ভুক্তভোগী, অভিযুক্ত বা অন্য ব্যক্তির নাম ও পরিচয় এখানে দেখানো হয় না।
      </p>
    </DutimzShell>
  );
}
