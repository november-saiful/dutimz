import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/* Fully static copy: prerender once, serve from the R2 page cache, refresh in background. */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "ব্যবহারের শর্তাবলি",
  description:
    "DUTIMZ ব্যবহারের শর্ত—অ্যাকাউন্ট, আপনার লেখার মালিকানা, সম্পাদকীয় সিদ্ধান্ত, সম্মানী ও উত্তোলনের নিয়ম।",
  alternates: { canonical: "/terms/" },
};

/*
  The agreement, as distinct from the two documents beside it.

  `/guidelines/` is the newsroom's editorial policy — how a story is verified and
  corrected. `/privacy/` is what data the site holds. Neither is a contract with
  a member, and this site has members who publish, comment, and are paid. This is
  where the money rules and the content licence belong.

  The fee and withdrawal thresholds are stated structurally rather than as
  figures: the rates live in `reporter_fee_for_tier()` and may change, and a
  policy that has to be amended every time a rate moves is a policy nobody keeps
  current. The ৳3,000 floor and the 35-article rule are named because the balance
  page already shows them to the member before they ask.
*/

type Section = {
  title: string;
  paragraphs: string[];
  list?: string[];
};

const UPDATED = "২৪ অক্টোবর ২০২৬";

const SECTIONS: Section[] = [
  {
    title: "এই শর্তাবলি কী নিয়ে",
    paragraphs: [
      "এই শর্তাবলি DUTIMZ ব্যবহারের নিয়ম ঠিক করে—অ্যাকাউন্ট খোলা, লেখা প্রকাশ, মন্তব্য করা এবং আয় ও উত্তোলনের মতো বিষয়গুলো। সাইট ব্যবহার করলে বা অ্যাকাউন্ট খুললে আপনি এই শর্তগুলো মেনে নিচ্ছেন।",
      "সম্পাদকীয় নীতিমালা আলাদা একটি নথি: প্রতিবেদন কীভাবে যাচাই হয় এবং সংশোধন হয় তা সেখানে বলা আছে। আপনার তথ্য নিয়ে কী করা হয় তা গোপনীয়তা নীতিতে বলা আছে।",
    ],
  },
  {
    title: "আপনার অ্যাকাউন্ট",
    paragraphs: [
      "প্রবেশ করতে হয় গুগল অ্যাকাউন্ট দিয়ে। একজন ব্যক্তির একটি অ্যাকাউন্ট। আপনার অ্যাকাউন্টে যা কিছু হয়—প্রকাশ, মন্তব্য, ভোট, উত্তোলনের অনুরোধ—তার দায় আপনার।",
      "ব্যবহারকারীনাম ৩ থেকে ২৪ অক্ষরের, ইংরেজি অক্ষর দিয়ে শুরু, ভেতরে অক্ষর, সংখ্যা ও আন্ডারস্কোর চলবে। নামটি স্থায়ী পরিচয়; আপনি নিজে তা বদলাতে পারবেন না, কেবল সম্পাদকীয় ডেস্ক অনুরোধে বদলায়।",
    ],
  },
  {
    title: "আপনার লেখার মালিকানা",
    paragraphs: [
      "আপনি যা লেখেন বা যে ছবি তোলেন, তার মালিকানা আপনারই থাকে। আমরা তা কেড়ে নিই না।",
      "তবে প্রকাশ করার জন্য আমাদের একটি অনুমতি দরকার: আপনি DUTIMZ-কে আপনার লেখা ও ছবি সম্পাদনা, প্রকাশ, সংরক্ষণ, অনুবাদ ও বিতরণ করার একটি অ-একচেটিয়া, রয়্যালটি-মুক্ত অনুমতি দিচ্ছেন—সাইটে, শেয়ার কার্ডে এবং আমাদের নিজস্ব সামাজিক মাধ্যমের পাতায়। প্রকাশিত লেখা আর্কাইভে থাকে, তাই এই অনুমতি লেখা সরানোর পরেও আগে বিতরণ হওয়া কপিগুলোর ক্ষেত্রে বলবৎ থাকে।",
      "আপনি নিশ্চিত করছেন যে লেখাটি আপনার নিজের, তথ্যগুলো সত্য, এবং কারও ছবি ব্যবহার করলে তার সম্মতি আছে।",
    ],
  },
  {
    title: "যা প্রকাশ করা যাবে না",
    paragraphs: [
      "মত প্রকাশের স্বাধীনতা প্রশ্নহীন, কিন্তু ক্যাম্পাসের মানুষকে ক্ষতির মুখে ফেলা যাবে না। নিচের বিষয়গুলো যেকোনো জায়গায়—প্রতিবেদন, স্পটলাইট বা মন্তব্যে—নিষিদ্ধ:",
    ],
    list: [
      "বানানো উদ্ধৃতি, ভুয়া তথ্য বা ইচ্ছাকৃতভাবে বিভ্রান্তিকর দাবি।",
      "কাউকে অপমান, হুমকি, হয়রানি বা ঘৃণার লক্ষ্য বানানো।",
      "সম্মতি ছাড়া কারও ফোন নম্বর, ঠিকানা, পরিচয়পত্র বা ব্যক্তিগত ছবি প্রকাশ।",
      "অন্যের লেখা নিজের নামে চালানো বা সূত্র ছাড়া ব্যবহার।",
      "বিনা অনুমতিতে অন্যের তোলা ছবি ব্যবহার।",
      "বিজ্ঞাপন, স্পাম বা বারবার একই পোস্ট।",
      "অন্য কেউ সেজে পোস্ট করা।",
      "আইনবিরোধী কাজ বা এমন কিছু যা কারও নিরাপত্তা ঝুঁকিতে ফেলে।",
    ],
  },
  {
    title: "সম্পাদকীয় সিদ্ধান্ত",
    paragraphs: [
      "কী প্রকাশিত হবে তা সম্পাদকীয় ডেস্ক ঠিক করে। ডেস্ক প্রয়োজনে লেখা সম্পাদনা, ছোট করা, শিরোনাম বদলানো, প্রকাশ স্থগিত বা প্রত্যাখ্যান করতে পারে—এবং প্রকাশিত লেখাও প্রয়োজনে নামাতে বা সরাতে পারে। প্রকাশ মানে চিরকাল প্রকাশিত থাকার প্রতিশ্রুতি নয়।",
      "প্রকাশিত লেখায় কিছু বদলালে তার কারণ ও সময় সংশোধন ও তথ্য যাচাই পাতায় প্রকাশ্যে নথিভুক্ত হয়। ভুল ধরলে corrections@dutimz.com-এ জানান।",
    ],
  },
  {
    title: "মন্তব্য ও স্পটলাইট",
    paragraphs: [
      "মন্তব্য ও স্পটলাইট পোস্টেও উপরের নিয়মগুলো প্রযোজ্য। লগইন করা যেকোনো সদস্য স্পটলাইটে শিরোনাম, বিবরণ ও সর্বোচ্চ দশটি ছবিসহ পোস্ট করতে পারেন।",
      "নিজের পোস্ট আপনি নিজে সরাতে পারেন। ডেস্ক প্রয়োজনে পোস্ট লুকাতে পারে (ফেরানো যায়) বা সরিয়ে দিতে পারে। মন্তব্যও একইভাবে নিয়ন্ত্রিত হয়।",
    ],
  },
  {
    title: "সম্মানী ও উত্তোলন",
    paragraphs: [
      "প্রতিবেদনের সম্মানী রিপোর্টার স্তর অনুযায়ী নির্ধারিত হয় এবং প্রতিটি প্রতিবেদনের প্রথম সফল প্রকাশনার সঙ্গে একবারই দেওয়া হয়। কেবল নির্ধারিত রিপোর্টাররাই সম্মানী পান; মডারেটর আলাদাভাবে রিপোর্টার স্তর পেলে তবেই পান।",
      "প্রোফাইল ১০০% সম্পূর্ণ না হলে সম্মানী আটকে থাকে; প্রয়োজনীয় তথ্য পূরণ হলে তা ছাড়া হয়।",
      "সর্বনিম্ন উত্তোলন ৳৩,০০০। প্রথম উত্তোলনের জন্য অন্তত ৩৫টি প্রকাশিত প্রতিবেদন এবং ১০০% সম্পূর্ণ প্রোফাইল প্রয়োজন। অনুরোধ জমা দিলে ওই টাকা আটকে রাখা হয়; ডেস্ক অনুরোধ প্রত্যাখ্যান করলে টাকা ফেরত আসে।",
      "সম্মানী কোনো বেতন বা চাকরির সম্পর্ক তৈরি করে না। হার সময়ে সময়ে বদলাতে পারে।",
    ],
  },
  {
    title: "যা করা যাবে না",
    paragraphs: [
      "সাইটটি স্বাভাবিকভাবে ব্যবহার করুন। স্বয়ংক্রিয়ভাবে পাতা কপি করা, সার্ভারে আক্রমণ বা অতিরিক্ত চাপ দেওয়া, প্রবেশাধিকার নিয়ন্ত্রণ এড়ানোর চেষ্টা, বিপুল সংখ্যক অ্যাকাউন্ট তৈরি বা সাইটের কনটেন্ট বিক্রি করা নিষিদ্ধ।",
    ],
  },
  {
    title: "সেবা ও দায়",
    paragraphs: [
      "সাইটটি যেমন আছে তেমনভাবে দেওয়া হয়। সব সময় চালু থাকার বা ত্রুটিমুক্ত থাকার নিশ্চয়তা আমরা দিতে পারি না; সেবা বদলানো, স্থগিত বা বন্ধ করা হতে পারে।",
      "অন্য কারও প্রকাশিত লেখার জন্য আমরা দায়ী নই। আইন যতটা অনুমতি দেয়, ততটা পর্যন্ত পরোক্ষ বা অপ্রত্যাশিত ক্ষতির জন্য দায় সীমিত। এই শর্তাবলি বাংলাদেশের আইনে আপনার যে অধিকার আছে তা খর্ব করে না।",
    ],
  },
  {
    title: "অ্যাকাউন্ট বন্ধ",
    paragraphs: [
      "এই শর্ত ভাঙলে আমরা অ্যাকাউন্ট স্থগিত বা বন্ধ করতে পারি। নিজের অ্যাকাউন্ট বন্ধ করতে চাইলে hello@dutimz.com-এ লিখুন; প্রকাশিত লেখা আর্কাইভে থাকতে পারে, তবে চাইলে আপনার নাম প্রত্যাহার করা যায়।",
    ],
  },
  {
    title: "প্রযোজ্য আইন ও পরিবর্তন",
    paragraphs: [
      `এই শর্তাবলি বাংলাদেশের আইন অনুযায়ী পরিচালিত। শর্তে উল্লেখযোগ্য পরিবর্তন হলে এই পাতায় জানানো হবে। সর্বশেষ হালনাগাদ: ${UPDATED}।`,
    ],
  },
];

export default function TermsPage() {
  return (
    <DutimzShell title="ব্যবহারের শর্তাবলি" crumbs={[{ label: "শর্তাবলি" }]}>
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            সাইট ব্যবহারের নিয়ম
          </p>
          <CardTitle className="text-3xl">ব্যবহারের শর্তাবলি</CardTitle>
        </CardHeader>
        <CardContent className="flex max-w-[68ch] flex-col gap-7 text-[16px] leading-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold">{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-2">
                  {paragraph}
                </p>
              ))}
              {section.list && (
                <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-6">
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section className="border-t border-border pt-5">
            <h2 className="text-xl font-semibold">যোগাযোগ</h2>
            <p className="mt-2">
              এই শর্ত নিয়ে যেকোনো প্রশ্ন থাকলে লিখুন{" "}
              <a
                href="mailto:hello@dutimz.com"
                className="text-primary underline underline-offset-4"
              >
                hello@dutimz.com
              </a>
              -এ। প্রতিবেদনে ভুল ধরলে{" "}
              <a
                href="mailto:corrections@dutimz.com"
                className="text-primary underline underline-offset-4"
              >
                corrections@dutimz.com
              </a>
              -এ জানান।
            </p>
          </section>
        </CardContent>
      </Card>
    </DutimzShell>
  );
}
