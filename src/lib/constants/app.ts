export const SITE = {
  name: "Dutimz",
  tagline: "সংবাদ, বিশ্লেষণ, প্রতিদিন",
  taglineEn: "News. Analysis. Every day.",
  url: "https://dutimz.com",
  description:
    "Dutimz — আধুনিক দ্বিভাষিক (বাংলা/ইংরেজি) সংবাদ পোর্টাল: খবর, ভিডিও, নিবন্ধ ও ডকুমেন্টারি।",
} as const;

export const LOCALES = ["bn", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "bn";

export const ROLE_HIERARCHY = {
  visitor: 1,
  reporter: 2,
  moderator: 3,
  admin: 4,
} as const;

export type UserRole = keyof typeof ROLE_HIERARCHY;

export const HOME_SECTIONS = {
  heroCount: 5,
  latestCount: 6,
  categoryItemsCount: 4,
  popularCount: 5,
} as const;

export const READING_TIME = {
  wordsPerMinute: 200,
} as const;
