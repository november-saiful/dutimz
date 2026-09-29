import type { Metadata } from "next";

import { ModerationQueue } from "@/components/account/moderation-queue";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";

export const metadata: Metadata = {
  title: "মডারেশন ডেস্ক",
  description: "অপেক্ষমাণ প্রতিবেদন পর্যালোচনা করুন।",
  alternates: { canonical: "/account/moderation/" },
};

export default function ModerationPage() {
  return (
    <DutimzShell title="মডারেশন ডেস্ক" crumbs={[{ label: "মডারেশন" }]}>
      <ModerationQueue />
    </DutimzShell>
  );
}
