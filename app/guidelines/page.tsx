import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "সম্পাদকীয় নীতিমালা",
  description: "DUTIMZ-এর তথ্যযাচাই, ন্যায্যতা, গোপনীয়তা ও সংশোধন নীতি।",
  alternates: { canonical: "/guidelines/" },
};

const SECTIONS = [
  {
    title: "যাচাই ও সূত্র",
    body: "প্রতিবেদককে তথ্যের উৎস উল্লেখ ও প্রাসঙ্গিক নথি যাচাই করতে হবে। গুরুতর অভিযোগের ক্ষেত্রে সংশ্লিষ্ট পক্ষের বক্তব্য নেওয়ার যথাসাধ্য চেষ্টা করতে হবে। গুজব, বানানো উদ্ধৃতি বা অসমর্থিত তথ্য প্রকাশ করা যাবে না।",
  },
  {
    title: "মতামত ও প্রতিবেদন আলাদা",
    body: "মতামত, ব্যক্তিগত অভিজ্ঞতা এবং সংবাদ প্রতিবেদনকে স্পষ্টভাবে চিহ্নিত করা হবে। মতামতের কারণে কাউকে হয়রানি, বিদ্বেষ বা ব্যক্তিগত আক্রমণের লক্ষ্য বানানো যাবে না।",
  },
  {
    title: "গোপনীয়তা",
    body: "শিক্ষার্থী নিবন্ধন, ব্যক্তিগত ফোন, আবাসন ও পেমেন্ট তথ্য প্রকাশ্য প্রোফাইলে দেখানো হবে না। সম্মতি ছাড়া ব্যক্তিগত তথ্য বা ঝুঁকিপূর্ণ ছবি প্রকাশ করা যাবে না।",
  },
  {
    title: "সংশোধন",
    body: "ত্রুটি জানাতে corrections@dutimz.com-এ প্রতিবেদনটির লিংক, ভুল অংশ এবং যাচাইযোগ্য সূত্র পাঠান। যাচাই করা সংশোধনের রেকর্ড সংরক্ষণ করা হবে। প্রকাশের পর প্রতিবেদনে কী বদলেছে এবং কেন—প্রতিটি সম্পাদনার কারণ সংশোধন ও তথ্য যাচাই পাতায় প্রকাশ্যে নথিভুক্ত থাকে।",
  },
];

export default function GuidelinesPage() {
  return (
    <DutimzShell title="সম্পাদকীয় নীতিমালা" crumbs={[{ label: "নীতিমালা" }]}>
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            বিশ্বাস ও জবাবদিহি
          </p>
          <CardTitle className="text-3xl">সম্পাদকীয় নীতিমালা</CardTitle>
        </CardHeader>
        <CardContent className="flex max-w-[68ch] flex-col gap-6 text-[16px] leading-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="mt-1">{section.body}</p>
            </section>
          ))}
        </CardContent>
      </Card>
    </DutimzShell>
  );
}
