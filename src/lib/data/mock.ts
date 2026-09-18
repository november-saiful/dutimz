import type { Category, ContentWithRelations } from "@/types";

const iso = (daysAgo: number, hours = 0): string =>
  new Date(Date.now() - daysAgo * 86_400_000 - hours * 3_600_000).toISOString();

export const mockCategories: Category[] = [
  { id: "c1", slug: "university-news", name_bn: "বিশ্ববিদ্যালয় সংবাদ", name_en: "University News", description: null, parent_id: null, sort_order: 1, is_active: true, created_at: iso(90) },
  { id: "c2", slug: "student-politics", name_bn: "ছাত্র রাজনীতি", name_en: "Student Politics", description: null, parent_id: null, sort_order: 2, is_active: true, created_at: iso(90) },
  { id: "c3", slug: "education-research", name_bn: "শিক্ষা ও গবেষণা", name_en: "Education & Research", description: null, parent_id: null, sort_order: 3, is_active: true, created_at: iso(90) },
  { id: "c4", slug: "sports", name_bn: "খেলাধুলা", name_en: "Sports", description: null, parent_id: null, sort_order: 4, is_active: true, created_at: iso(90) },
  { id: "c5", slug: "culture-events", name_bn: "সংস্কৃতি ও অনুষ্ঠান", name_en: "Culture & Events", description: null, parent_id: null, sort_order: 5, is_active: true, created_at: iso(90) },
  { id: "c6", slug: "technology", name_bn: "প্রযুক্তি", name_en: "Technology", description: null, parent_id: null, sort_order: 6, is_active: true, created_at: iso(90) },
  { id: "c7", slug: "lifestyle", name_bn: "জীবনযাপন", name_en: "Lifestyle", description: null, parent_id: null, sort_order: 7, is_active: true, created_at: iso(90) },
];

const mockContents: ContentWithRelations[] = [
  {
    id: "1",
    slug: "bijoy-ekattar-hall-clubroom-plaque-vandalism",
    content_type: "news",
    content_format: "text",
    language_primary: "bn",
    title_bn: "বিজয় একাত্তর হলের ক্লাব রুমের নামফলক ভাঙচুর",
    subtitle_bn: null,
    excerpt_bn:
      "ঢাকা বিশ্ববিদ্যালয়ের বিজয় একাত্তর হলের নবনির্মিত ক্লাব রুমের উদ্বোধনী নামফলক ভাঙচুরের ঘটনা ঘটেছে।",
    body_bn: `<p>ঢাকা বিশ্ববিদ্যালয়ের বিজয় একাত্তর হলের নবনির্মিত ক্লাব রুমের উদ্বোধনী নামফলক ভাঙচুরের ঘটনা ঘটেছে।</p>
<p>শিক্ষার্থীদের সাংস্কৃতিক ও সহশিক্ষা কার্যক্রমের সুবিধার্থে প্রস্তুত করা এই ক্লাব রুমটির নামফলকে ঢাকা বিশ্ববিদ্যালয় কেন্দ্রীয় ছাত্র সংসদ (ডাকসু)-এর এজিএস মহিউদ্দীন খানের নাম থাকাকে কেন্দ্র করে এ অপ্রীতিকর ঘটনার সৃষ্টি হয় বলে অভিযোগ উঠেছে। ঘটনার পেছনে ছাত্রদলের নেতাকর্মীদের সম্পৃক্ততার অভিযোগ তুলেছে হল সংসদ।</p>
<p>হল সংসদ সূত্রে জানা যায়, শিক্ষার্থীদের সৃজনশীল ও সামাজিক কার্যক্রম এগিয়ে নিতে দীর্ঘদিন ধরে একটি উপযুক্ত ক্লাব রুম প্রতিষ্ঠার কাজ চলছিল। পরিকল্পনা থেকে শুরু করে বাস্তবায়ন পর্যন্ত প্রতিটি পর্যায়ে হল সংসদের প্রতিনিধিরা এবং হল প্রশাসনের সংশ্লিষ্ট শিক্ষকরা সক্রিয়ভাবে যুক্ত ছিলেন। রুমটির প্রয়োজনীয় সরঞ্জাম ও অর্থায়নের অর্ধেক দেয় বিজয় একাত্তর হল প্রশাসন এবং বাকি অংশের অর্থায়ন প্রাধ্যক্ষের অনুমতি সাপেক্ষে ডাকসুর এজিএস মহিউদ্দিন খানের মাধ্যমে সংগৃহীত হয়। সার্বিক আলোচনা ও হল প্রাধ্যক্ষের অবগতির ভিত্তিতেই সংশ্লিষ্টদের নাম যুক্ত করে উদ্বোধনী নামফলকটি স্থাপন করা হয়েছিল।</p>
<p>তবে নামফলকটি স্থাপনের পরপরই ভাঙচুরের শিকার হয়। এ ঘটনায় গভীর উদ্বেগ ও ক্ষোভ প্রকাশ করেছে বিজয় একাত্তর হল সংসদ। এক বিবৃতিতে তারা জানায়, কোনো ব্যক্তির রাজনৈতিক পরিচয় বা মতাদর্শের বিরোধিতাকে কেন্দ্র করে শিক্ষার্থীদের জন্য নেওয়া একটি ইতিবাচক ও প্রাতিষ্ঠানিক উদ্যোগ ক্ষতিগ্রস্ত করা কোনোভাবেই গ্রহণযোগ্য নয়। মতভেদ প্রকাশের ক্ষেত্রে ভাঙচুর নয়, বরং প্রশাসনিক ও গণতান্ত্রিক পথ অনুসরণ করাই কাম্য।</p>
<p>ঘটনার প্রেক্ষিতে সিসিটিভি ফুটেজ ও প্রাসঙ্গিক প্রমাণ যাচাই করে জড়িতদের দ্রুত শনাক্তকরণ এবং বিশ্ববিদ্যালয়ের বিধি অনুযায়ী শাস্তিমূলক ব্যবস্থা গ্রহণের দাবি জানানো হয়েছে। একই সঙ্গে দ্রুত নামফলক পুনঃস্থাপন করে ক্লাব রুমটির কার্যক্রম নির্বিঘ্ন করার জন্য হল প্রশাসনের কার্যকর পদক্ষেপ প্রত্যাশা করছেন সাধারণ শিক্ষার্থী ও হল সংসদের প্রতিনিধিরা।</p>`,
    title_en: "Vandalism of club room plaque at Bijoy Ekattar Hall",
    subtitle_en: null,
    excerpt_en:
      "The inaugural nameplate of the newly built club room at Dhaka University's Bijoy Ekattar Hall was vandalised.",
    body_en: `<p>The inaugural nameplate of the newly built club room at Dhaka University's Bijoy Ekattar Hall was vandalised.</p>`,
    thumbnail_url: "/news-clubroom-plaque-vandalism.jpeg",
    thumbnail_alt: "বিজয় একাত্তর হলের ক্লাব রুমের নামফলক ভাঙচুরের ছবি",
    featured_image_url: null,
    video_url: null,
    video_duration: null,
    attachments: [],
    category_id: "c2",
    tags: [],
    author_id: null,
    status: "published",
    published_at: iso(0, 2),
    scheduled_at: null,
    view_count: 156,
    read_time: 4,
    meta_title: null,
    meta_description: null,
    og_image_url: null,
    is_featured: true,
    is_breaking: true,
    is_commentable: true,
    allow_notifications: true,
    version: 1,
    parent_version_id: null,
    created_by: null,
    updated_by: null,
    created_at: iso(0, 2),
    updated_at: iso(0, 2),
    category: {
      id: "c2",
      slug: "student-politics",
      name_bn: "ছাত্র রাজনীতি",
      name_en: "Student Politics",
      description: null,
      parent_id: null,
      sort_order: 2,
      is_active: true,
      created_at: iso(90),
    },
    author: {
      id: "a1",
      username: "dutimz_desk",
      display_name: "দুতিমজ ডেস্ক",
      avatar_url: null,
      is_verified: true,
    },
  },
];

export { mockContents };

export function getMockContentBySlug(slug: string): ContentWithRelations | undefined {
  return mockContents.find((c) => c.slug === slug);
}

export function getMockCategory(slug: string): Category | undefined {
  return mockCategories.find((c) => c.slug === slug);
}
