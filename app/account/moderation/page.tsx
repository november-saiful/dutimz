import type { Metadata } from "next";

import { RoleGate } from "@/components/account/role-gate";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";

export const metadata: Metadata = {
  title: "মডারেশন ডেস্ক",
  description: "অপেক্ষমাণ প্রতিবেদন পর্যালোচনা করুন।",
  alternates: { canonical: "/account/moderation/" },
};

export default function ModerationPage() {
  return (
    <DutimzShell title="মডারেশন ডেস্ক" crumbs={[{ label: "মডারেশন" }]}>
      <RoleGate
        roles={["moderator", "admin"]}
        title="মডারেশন ডেস্ক"
        description="এই ডেস্ক কেবল মডারেটর ও অ্যাডমিনদের জন্য।"
      />
    </DutimzShell>
  );
}
