/**
 * What a build without credentials shows.
 *
 * Demo builds and pull-request previews have no Supabase project behind them, so
 * every reading surface that would otherwise be empty is filled from here — the
 * front page's lead deck, the article view's rails and now both profile pages.
 * The fixtures live in their own module because they are read by *client*
 * components as well as server ones: `lib/stories.ts` reaches for the
 * server-side Supabase client, so a browser component importing the fixtures
 * from there would drag the whole module graph (and a service-role client) into
 * the bundle. This file imports nothing.
 *
 * These are illustrative, never a story or a member that exists: the handles,
 * titles and numbers below are the same kind of preview copy the front page has
 * always shown, and a real build reads the database instead.
 */

export type PreviewStory = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  categorySlug: string;
  author: string;
  time: string;
  imageUrl?: string;
};

/** Same illustrative copy as src/data/stories.ts demo mode. */
export const previewStories: PreviewStory[] = [
  {
    slug: "campus-voices-preview",
    title: "শিক্ষার্থীদের ভাবনা ও উদ্যোগে আরও প্রাণবন্ত হোক ক্যাম্পাস",
    excerpt:
      "ক্যাম্পাসজুড়ে শিক্ষার্থীদের নতুন উদ্যোগ, মতামত আর সম্ভাবনার গল্প তুলে ধরবে DUTIMZ।",
    category: "ক্যাম্পাস",
    categorySlug: "campus",
    author: "সম্পাদকীয় ডেস্ক",
    time: "প্রিভিউ",
    imageUrl:
      "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=85",
  },
  {
    slug: "library-preview",
    title: "পড়াশোনা, গবেষণা ও মুক্তচিন্তার মিলনস্থল আমাদের বিশ্ববিদ্যালয়",
    excerpt:
      "বিশ্ববিদ্যালয়ের নানা পরিসর থেকে উঠে আসা ভাবনা ও অভিজ্ঞতার জন্য থাকছে আলাদা আয়োজন।",
    category: "ক্যাম্পাস",
    categorySlug: "campus",
    author: "সম্পাদকীয় ডেস্ক",
    time: "প্রিভিউ",
    imageUrl:
      "https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1200&q=85",
  },
  {
    slug: "culture-preview",
    title: "সংস্কৃতি, সৃজনশীলতা আর শিক্ষার্থীদের নিজের মঞ্চ",
    excerpt: "ক্যাম্পাসের শিল্প, সাহিত্য ও সাংস্কৃতিক আয়োজনের খবর এক জায়গায়।",
    category: "সংস্কৃতি",
    categorySlug: "culture",
    author: "সম্পাদকীয় ডেস্ক",
    time: "প্রিভিউ",
    imageUrl:
      "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=1200&q=85",
  },
  {
    slug: "student-life-preview",
    title: "ক্যাম্পাস জীবনের গল্পে শিক্ষার্থীদের কণ্ঠস্বর",
    excerpt:
      "হল, ক্লাব, পাঠচক্র ও প্রতিদিনের ক্যাম্পাসজীবনের নানা দিক নিয়ে ধারাবাহিক আয়োজন।",
    category: "শিক্ষার্থী জীবন",
    categorySlug: "student-life",
    author: "সম্পাদকীয় ডেস্ক",
    time: "প্রিভিউ",
    imageUrl:
      "https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1200&q=85",
  },
];

/**
 * The member both profile pages show when there is no database: the public view
 * (`/u/<handle>/`) and the dashboard (`/account/`) read the same person, so a
 * preview cannot show two different people on the two halves of one identity.
 *
 * The handle is a real shape — lowercase letters and underscores, which is what
 * the public route accepts — and it is the *only* handle the fixture answers to,
 * so an unknown handle in a demo build still gets the missing-profile page
 * rather than this member's face.
 */
export const previewMember = {
  username: "rafia_islam",
  displayName: "রাফিয়া ইসলাম",
  role: "reporter" as const,
  bio: "হলজীবন, পাঠচক্র আর শিক্ষার্থী আন্দোলনের খবর লিখি। ক্যাম্পাস ডেস্কের সঙ্গে কাজ করছি দুই বছর, বেশিরভাগ সময় ক্যাম্পাসের ভেতরের ছোট ঘটনাগুলো টুকে রাখতে গিয়েই কেটেছে।",
  department: "গণযোগাযোগ ও সাংবাদিকতা",
  session: "২০২১–২২",
  hallName: "রোকেয়া হল",
  residency: "hall_resident" as const,
  joined: "মার্চ ২০২৩",
  completion: 82,
  balance: 1450,
  /** Rows in the same shape the dashboard's own queries return. */
  articles: [
    {
      id: "preview-1",
      slug: "campus-voices-preview",
      title: "শিক্ষার্থীদের ভাবনা ও উদ্যোগে আরও প্রাণবন্ত হোক ক্যাম্পাস",
      status: "published",
      created_at: "2026-09-24T09:00:00.000Z",
      published_at: "2026-09-26T09:00:00.000Z",
      rejected_at: null,
    },
    {
      id: "preview-2",
      slug: "library-preview",
      title: "পড়াশোনা, গবেষণা ও মুক্তচিন্তার মিলনস্থল আমাদের বিশ্ববিদ্যালয়",
      status: "published",
      created_at: "2026-09-04T09:00:00.000Z",
      published_at: "2026-09-06T09:00:00.000Z",
      rejected_at: null,
    },
    {
      id: "preview-3",
      slug: "culture-preview",
      title: "সংস্কৃতি, সৃজনশীলতা আর শিক্ষার্থীদের নিজের মঞ্চ",
      status: "pending",
      created_at: "2026-10-02T09:00:00.000Z",
      published_at: null,
      rejected_at: null,
    },
    {
      id: "preview-4",
      slug: "student-life-preview",
      title: "হলের রাতে পাঠকক্ষ: কে জাগে, কে পড়ে",
      status: "rejected",
      created_at: "2026-09-18T09:00:00.000Z",
      published_at: null,
      rejected_at: "2026-09-21T09:00:00.000Z",
    },
  ],
  spotlights: [
    {
      id: "preview-s1",
      title: "কেন্দ্রীয় গ্রন্থাগার রাত ৯টা পর্যন্ত খোলা রাখার দাবি",
      issue_status: "in_progress",
      created_at: "2026-10-05T09:00:00.000Z",
      solver_kind: null,
      solver_name: "গ্রন্থাগার দপ্তর",
      solve_duration: null,
      issue_note: "দপ্তর বলেছে সময়সীমা পরীক্ষামূলক বাড়ানো হয়েছে।",
    },
    {
      id: "preview-s2",
      title: "রোকেয়া হলের ওয়াটার কুলার মেরামত",
      issue_status: "solved",
      created_at: "2026-09-12T09:00:00.000Z",
      solver_kind: "hall",
      solver_name: null,
      solve_duration: "৪ দিন",
      issue_note: null,
    },
  ],
};
