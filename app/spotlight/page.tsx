import type { Metadata } from "next";

import { SpotlightForum } from "@/components/forum/spotlight-forum";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
      <SpotlightForum />
    </DutimzShell>
  );
}
