import type { Metadata } from "next";

import { ModerationQueue } from "@/components/account/moderation-queue";
import { PendingEdits } from "@/components/account/pending-edits";
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
      {/*
        The second queue: writing that is already live and wants correcting. It sits after the
        pending submissions because a story that has never been published is the more urgent of the
        two, and because approving one is a different decision from editing one already in print.
      */}
      <PendingEdits />
    </DutimzShell>
  );
}
