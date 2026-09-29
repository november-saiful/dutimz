import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { ProfileEditor } from "@/components/profile/profile-editor";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "প্রোফাইল সম্পাদনা",
  description: "আপনার DUTIMZ প্রোফাইল হালনাগাদ করুন।",
  alternates: { canonical: "/profile/me/" },
};

export default function ProfileMePage() {
  return (
    <DutimzShell title="প্রোফাইল সম্পাদনা" crumbs={[{ label: "প্রোফাইল" }]}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">প্রোফাইল সম্পাদনা</CardTitle>
          <CardDescription>
            তথ্যগুলো ব্যক্তিগত থাকবে। আয়ের সুবিধার জন্য প্রোফাইল ১০০% সম্পূর্ণ
            করতে হবে।
          </CardDescription>
        </CardHeader>
      </Card>
      <ProfileEditor />
    </DutimzShell>
  );
}
