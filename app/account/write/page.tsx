import type { Metadata } from "next";

import { WriterForm } from "@/components/account/writer-form";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "প্রতিবেদন লিখুন",
  description: "DUTIMZ-এ প্রতিবেদন পাঠান অথবা রিপোর্টার হিসেবে আবেদন করুন।",
  alternates: { canonical: "/account/write/" },
};

export default function WritePage() {
  return (
    <DutimzShell title="প্রতিবেদন লিখুন" crumbs={[{ label: "লিখুন" }]}>
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            ক্যাম্পাসের কণ্ঠ হয়ে উঠুন
          </p>
          <CardTitle className="text-2xl">প্রতিবেদন লিখুন</CardTitle>
          <CardDescription>
            সঠিক তথ্য, নিরপেক্ষ ভাষা ও প্রকাশের দায়িত্ববোধ নিয়ে আপনার গল্পটি
            পাঠান।
          </CardDescription>
        </CardHeader>
      </Card>
      <WriterForm />
    </DutimzShell>
  );
}
