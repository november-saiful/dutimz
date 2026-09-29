import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "আমাদের পরিচয়",
  description: "DUTIMZ — ঢাকা বিশ্ববিদ্যালয়ের সংবাদমাধ্যমের পরিচয়।",
  alternates: { canonical: "/about/" },
};

export default function AboutPage() {
  return (
    <DutimzShell title="আমাদের পরিচয়" crumbs={[{ label: "পরিচয়" }]}>
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            DUTIMZ সংবাদমাধ্যম
          </p>
          <CardTitle className="text-3xl">আমাদের পরিচয়</CardTitle>
          <CardDescription>
            ঢাকা বিশ্ববিদ্যালয়ের কণ্ঠস্বর — ক্যাম্পাসের খবর, ক্যাম্পাসের কণ্ঠে।
          </CardDescription>
        </CardHeader>
        <CardContent className="flex max-w-[68ch] flex-col gap-4 text-[16px] leading-8">
          <p>
            DUTIMZ ঢাকা বিশ্ববিদ্যালয়ের শিক্ষার্থী ও পাঠকদের নিজস্ব
            সংবাদমাধ্যম। ক্যাম্পাসের সংবাদ, শিক্ষার্থী জীবন, সংস্কৃতি, মতামত ও
            বিশ্ববিদ্যালয়ের গল্প — সম্পাদিত ও যাচাই করা প্রতিবেদন আমরা প্রকাশ
            করি।
          </p>
          <p>
            যেকোনো শিক্ষার্থী বা পাঠক নিজের প্রতিবেদন পাঠাতে পারেন। প্রকাশের
            আগে প্রতিটি প্রতিবেদন সম্পাদকীয় ডেস্ক যাচাই করে।
          </p>
        </CardContent>
      </Card>
    </DutimzShell>
  );
}
