import type { Metadata } from "next";

import { CorrectionsList } from "@/components/corrections/corrections-list";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "সংশোধন ও তথ্য যাচাই",
  description:
    "প্রকাশের পর DUTIMZ-এর প্রতিবেদনে কী বদলেছে এবং কেন—প্রতিটি সম্পাদনার কারণ পাঠকের সামনে খোলা।",
  alternates: { canonical: "/corrections/" },
};

export default function CorrectionsPage() {
  return (
    <DutimzShell title="সংশোধন ও তথ্য যাচাই" crumbs={[{ label: "সংশোধন" }]}>
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            স্বচ্ছ সম্পাদনা
          </p>
          <CardTitle className="text-3xl">সংশোধন ও তথ্য যাচাই</CardTitle>
          <CardDescription>
            ভুল হলে আমরা লুকাই না। প্রকাশিত প্রতিবেদনে যখনই কিছু পরিবর্তিত হয়,
            তার কারণ, সময় ও কে সম্পাদনা করেছেন তা নিচের তালিকায় নথিভুক্ত
            থাকে।
          </CardDescription>
        </CardHeader>
      </Card>
      <CorrectionsList />
      <Card>
        <CardHeader>
          <CardTitle>সংশোধনের অনুরোধ পাঠান</CardTitle>
          <CardDescription>
            তথ্য ভুল মনে হলে নথি বা সূত্রসহ জানান। সম্পাদকীয় ডেস্ক যাচাই করে
            সংশোধন করবে।
          </CardDescription>
        </CardHeader>
      </Card>
      <Button variant="outline" asChild className="self-start">
        <a href="mailto:corrections@dutimz.com?subject=সংশোধনের অনুরোধ">
          সংশোধন জানান →
        </a>
      </Button>
    </DutimzShell>
  );
}
