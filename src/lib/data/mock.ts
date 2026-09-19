import type { Category, ContentType, ContentWithRelations } from "@/types";

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

const MOCK_AUTHOR = {
  id: "a1",
  username: "dutimz_desk",
  display_name: "দুতিমজ ডেস্ক",
  avatar_url: null,
  is_verified: true,
} as const;

interface MockStorySeed {
  id: string;
  slug: string;
  category_id: string;
  title_bn: string;
  title_en: string;
  excerpt_bn: string;
  excerpt_en: string;
  body_bn: string;
  body_en: string;
  thumbnail_url: string;
  thumbnail_alt: string;
  /** Published this long ago — the feed is authored newest-first. */
  daysAgo?: number;
  hoursAgo?: number;
  content_type?: ContentType;
  view_count?: number;
  read_time?: number;
  is_featured?: boolean;
  is_breaking?: boolean;
}

/**
 * Shared defaults for a published mock story.
 *
 * The mock feed is what local development and the demo deployment render, and
 * every category needs at least one story: a feed with a single item leaves
 * the homepage hero (an orbiting ring that wants one story per category)
 * unable to turn, and empties the per-category sections below it.
 */
function mockContent(seed: MockStorySeed): ContentWithRelations {
  const publishedAt = iso(seed.daysAgo ?? 0, seed.hoursAgo ?? 0);
  return {
    id: seed.id,
    slug: seed.slug,
    content_type: seed.content_type ?? "news",
    content_format: "text",
    language_primary: "bn",
    title_bn: seed.title_bn,
    subtitle_bn: null,
    excerpt_bn: seed.excerpt_bn,
    body_bn: seed.body_bn,
    title_en: seed.title_en,
    subtitle_en: null,
    excerpt_en: seed.excerpt_en,
    body_en: seed.body_en,
    thumbnail_url: seed.thumbnail_url,
    thumbnail_alt: seed.thumbnail_alt,
    featured_image_url: null,
    video_url: null,
    video_duration: null,
    attachments: [],
    category_id: seed.category_id,
    tags: [],
    author_id: MOCK_AUTHOR.id,
    status: "published",
    published_at: publishedAt,
    scheduled_at: null,
    view_count: seed.view_count ?? 0,
    read_time: seed.read_time ?? 3,
    meta_title: null,
    meta_description: null,
    og_image_url: null,
    is_featured: seed.is_featured ?? false,
    is_breaking: seed.is_breaking ?? false,
    is_commentable: true,
    allow_notifications: true,
    version: 1,
    parent_version_id: null,
    created_by: null,
    updated_by: null,
    created_at: publishedAt,
    updated_at: publishedAt,
    category: mockCategories.find((c) => c.id === seed.category_id) ?? null,
    author: MOCK_AUTHOR,
  };
}

const mockContents: ContentWithRelations[] = [
  mockContent({
    id: "1",
    slug: "bijoy-ekattar-hall-clubroom-plaque-vandalism",
    category_id: "c2",
    title_bn: "বিজয় একাত্তর হলের ক্লাব রুমের নামফলক ভাঙচুর",
    title_en: "Vandalism of club room plaque at Bijoy Ekattar Hall",
    excerpt_bn:
      "ঢাকা বিশ্ববিদ্যালয়ের বিজয় একাত্তর হলের নবনির্মিত ক্লাব রুমের উদ্বোধনী নামফলক ভাঙচুরের ঘটনা ঘটেছে।",
    excerpt_en:
      "The inaugural nameplate of the newly built club room at Bijoy Ekattar Hall was vandalised.",
    body_bn: `<p>ঢাকা বিশ্ববিদ্যালয়ের বিজয় একাত্তর হলের নবনির্মিত ক্লাব রুমের উদ্বোধনী নামফলক ভাঙচুরের ঘটনা ঘটেছে।</p>
<p>শিক্ষার্থীদের সাংস্কৃতিক ও সহশিক্ষা কার্যক্রমের সুবিধার্থে প্রস্তুত করা এই ক্লাব রুমটির নামফলকে ঢাকা বিশ্ববিদ্যালয় কেন্দ্রীয় ছাত্র সংসদ (ডাকসু)-এর এজিএস মহিউদ্দীন খানের নাম থাকাকে কেন্দ্র করে এ অপ্রীতিকর ঘটনার সৃষ্টি হয় বলে অভিযোগ উঠেছে। ঘটনার পেছনে ছাত্রদলের নেতাকর্মীদের সম্পৃক্ততার অভিযোগ তুলেছে হল সংসদ।</p>
<p>হল সংসদ সূত্রে জানা যায়, শিক্ষার্থীদের সৃজনশীল ও সামাজিক কার্যক্রম এগিয়ে নিতে দীর্ঘদিন ধরে একটি উপযুক্ত ক্লাব রুম প্রতিষ্ঠার কাজ চলছিল। পরিকল্পনা থেকে শুরু করে বাস্তবায়ন পর্যন্ত প্রতিটি পর্যায়ে হল সংসদের প্রতিনিধিরা এবং হল প্রশাসনের সংশ্লিষ্ট শিক্ষকরা সক্রিয়ভাবে যুক্ত ছিলেন। রুমটির প্রয়োজনীয় সরঞ্জাম ও অর্থায়নের অর্ধেক দেয় বিজয় একাত্তর হল প্রশাসন এবং বাকি অংশের অর্থায়ন প্রাধ্যক্ষের অনুমতি সাপেক্ষে ডাকসুর এজিএস মহিউদ্দিন খানের মাধ্যমে সংগৃহীত হয়। সার্বিক আলোচনা ও হল প্রাধ্যক্ষের অবগতির ভিত্তিতেই সংশ্লিষ্টদের নাম যুক্ত করে উদ্বোধনী নামফলকটি স্থাপন করা হয়েছিল।</p>
<p>তবে নামফলকটি স্থাপনের পরপরই ভাঙচুরের শিকার হয়। এ ঘটনায় গভীর উদ্বেগ ও ক্ষোভ প্রকাশ করেছে বিজয় একাত্তর হল সংসদ। এক বিবৃতিতে তারা জানায়, কোনো ব্যক্তির রাজনৈতিক পরিচয় বা মতাদর্শের বিরোধিতাকে কেন্দ্র করে শিক্ষার্থীদের জন্য নেওয়া একটি ইতিবাচক ও প্রাতিষ্ঠানিক উদ্যোগ ক্ষতিগ্রস্ত করা কোনোভাবেই গ্রহণযোগ্য নয়। মতভেদ প্রকাশের ক্ষেত্রে ভাঙচুর নয়, বরং প্রশাসনিক ও গণতান্ত্রিক পথ অনুসরণ করাই কাম্য।</p>`,
    body_en: `<p>The inaugural nameplate of the newly built club room at Dhaka University's Bijoy Ekattar Hall was vandalised.</p>
<p>The hall council says a room built for student cultural activity was damaged over the name on its plaque, and has asked the administration to identify those responsible.</p>`,
    thumbnail_url: "/news-clubroom-plaque-vandalism.jpeg",
    thumbnail_alt: "বিজয় একাত্তর হলের ক্লাব রুমের নামফলক ভাঙচুরের ছবি",
    hoursAgo: 2,
    view_count: 156,
    read_time: 4,
    is_featured: true,
    is_breaking: true,
  }),
  mockContent({
    id: "2",
    slug: "new-academic-year-campus-changes",
    category_id: "c1",
    title_bn: "নতুন শিক্ষাবর্ষে ক্যাম্পাসে যেসব পরিবর্তন আসছে",
    title_en: "What changes on campus this academic year",
    excerpt_bn:
      "ভর্তি প্রক্রিয়া, লাইব্রেরির সময়সীমা এবং পরিবহন ব্যবস্থায় আসছে নতুন নিয়ম।",
    excerpt_en:
      "Admissions, library hours and campus transport all get new rules this year.",
    body_bn:
      "<p>নতুন শিক্ষাবর্ষ শুরুর আগে প্রশাসন কয়েকটি বড় পরিবর্তন ঘোষণা করেছে। লাইব্রেরি এখন রাত ১০টা পর্যন্ত খোলা থাকবে এবং ক্যাম্পাস বাসের রুট পুনর্বিন্যাস করা হয়েছে। ভর্তি সংক্রান্ত সব তথ্য একটি কেন্দ্রীয় পোর্টালে পাওয়া যাবে।</p>",
    body_en:
      "<p>Ahead of the new academic year the administration has announced longer library hours, revised bus routes and a single portal for admission information.</p>",
    thumbnail_url:
      "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?auto=format&fit=crop&w=1200&q=60",
    thumbnail_alt: "ক্যাম্পাসে শিক্ষার্থীদের ভিড়",
    hoursAgo: 8,
    view_count: 940,
    read_time: 5,
    is_featured: true,
    is_breaking: true,
  }),
  mockContent({
    id: "3",
    slug: "inter-hall-cricket-final-salimullah",
    category_id: "c4",
    title_bn: "আন্তঃহল ক্রিকেটে চ্যাম্পিয়ন সলিমুল্লাহ হল",
    title_en: "Salimullah Hall wins the inter-hall cricket final",
    excerpt_bn: "শেষ ওভারে নাটকীয় জয়ে ট্রফি ঘরে তুলল সলিমুল্লাহ হল।",
    excerpt_en: "A last-over finish decided this year's inter-hall cricket title.",
    body_bn:
      "<p>শেষ ওভারে প্রয়োজন ছিল ১২ রান। দুই ছক্কায় ম্যাচের রং বদলে দেন সলিমুল্লাহ হলের ওপেনার। তিন দিনের এই টুর্নামেন্টে মোট ১২টি হল অংশ নেয়। ফাইনাল শেষে বিজয়ীদের হাতে ট্রফি তুলে দেন উপাচার্য।</p>",
    body_en:
      "<p>Salimullah Hall chased down 12 runs in the final over to win the inter-hall cricket tournament, with 12 halls taking part.</p>",
    thumbnail_url:
      "https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=1200&q=60",
    thumbnail_alt: "ক্রিকেট মাঠে খেলোয়াড়",
    daysAgo: 1,
    view_count: 1310,
    read_time: 3,
    is_featured: true,
  }),
  mockContent({
    id: "4",
    slug: "library-digital-catalogue-launch",
    category_id: "c6",
    title_bn: "লাইব্রেরিতে চালু হলো ডিজিটাল ক্যাটালগ",
    title_en: "Library launches a digital catalogue",
    excerpt_bn:
      "অনলাইনে বই খুঁজে সময়সূচি মেনে আসন বুক করা যাবে বলে জানিয়েছে কর্তৃপক্ষ।",
    excerpt_en: "Readers can now search the collection online and book a seat in advance.",
    body_bn:
      "<p>কেন্দ্রীয় লাইব্রেরির পুরো সংগ্রহ এখন অনলাইনে অনুসন্ধানযোগ্য। শিক্ষার্থীরা নিজের আইডি দিয়ে লগইন করে আসন বুক করতে পারবেন এবং বইয়ের অবস্থানও দেখে নিতে পারবেন। প্রথম পর্যায়ে তিনটি কক্ষে পরীক্ষামূলকভাবে চালু হয়েছে এই সেবা।</p>",
    body_en:
      "<p>The central library's full collection is now searchable online, and students can reserve a reading seat in advance through the same portal.</p>",
    thumbnail_url:
      "https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=1200&q=60",
    thumbnail_alt: "লাইব্রেরিতে কম্পিউটারে কাজ করছেন শিক্ষার্থী",
    daysAgo: 1,
    hoursAgo: 6,
    view_count: 640,
    read_time: 4,
  }),
  mockContent({
    id: "5",
    slug: "campus-folk-festival-opens",
    category_id: "c5",
    title_bn: "ক্যাম্পাসে শুরু হলো তিন দিনের লোকজ উৎসব",
    title_en: "Three-day folk festival opens on campus",
    excerpt_bn: "ভাওয়াইয়া ও ভাটিয়ালি গানের পাশাপাশি থাকছে লোকজ নাটক।",
    excerpt_en: "Bhawaiya and Bhatiali performances headline the three-day programme.",
    body_bn:
      "<p>কেন্দ্রীয় মঞ্চে শুরু হয়েছে তিন দিনের লোকজ উৎসব। প্রথম দিনেই দর্শকদের ভিড় ছিল চোখে পড়ার মতো। উৎসবে বাউল গান, লোকজ নাটক ও হস্তশিল্পের স্টল রয়েছে। সমাপনী দিনে থাকবে পুরস্কার বিতরণী অনুষ্ঠান।</p>",
    body_en:
      "<p>The three-day folk festival opened at the central stage with Baul music, folk theatre and craft stalls, closing with an awards ceremony.</p>",
    thumbnail_url:
      "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=1200&q=60",
    thumbnail_alt: "সাংস্কৃতিক অনুষ্ঠানে দর্শক",
    daysAgo: 2,
    hoursAgo: 4,
    view_count: 520,
    read_time: 3,
  }),
  mockContent({
    id: "6",
    slug: "research-grant-increase-22-percent",
    category_id: "c3",
    title_bn: "গবেষণা বরাদ্দ বেড়েছে ২২ শতাংশ",
    title_en: "Research allocation up 22 percent",
    excerpt_bn: "তরুণ গবেষকদের জন্য আলাদা তহবিল চালু করার ঘোষণা।",
    excerpt_en: "A separate fund for early-career researchers is part of the increase.",
    body_bn:
      "<p>চলতি বছর গবেষণা খাতে বরাদ্দ ২২ শতাংশ বেড়েছে। নতুন তহবিল থেকে স্নাতকোত্তর শিক্ষার্থীরা সরাসরি অনুদান পাবেন। গবেষণাপত্র প্রকাশে আন্তর্জাতিক জার্নালের পাশাপাশি স্থানীয় জার্নালেও উৎসাহ দেওয়া হবে।</p>",
    body_en:
      "<p>Research funding is up 22 percent this year, including a new fund that postgraduate researchers can apply to directly.</p>",
    thumbnail_url:
      "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=60",
    thumbnail_alt: "গবেষণাগারে কাজ",
    daysAgo: 3,
    view_count: 410,
    read_time: 5,
  }),
  mockContent({
    id: "7",
    slug: "healthy-sleep-routine-for-students",
    category_id: "c7",
    title_bn: "রাতজাগা রুটিন ঠিক করার সহজ উপায়",
    title_en: "Simple ways to fix a late-night routine",
    excerpt_bn:
      "পরীক্ষার আগে ঘুমের সময় ঠিক রাখতে চিকিৎসকদের কয়েকটি পরামর্শ।",
    excerpt_en: "Doctors share a few habits that help students keep a steady sleep schedule.",
    body_bn:
      "<p>রাত জেগে পড়ার অভ্যাস অনেক শিক্ষার্থীর কাছেই স্বাভাবিক। তবে ঘুমের সময় প্রতিদিন একই রাখলে মনোযোগ ও স্মৃতি দুটোই ভালো থাকে। শোবার আগে এক ঘণ্টা মোবাইল না দেখা এবং বিকেলে ছোট ভাতঘুম এড়িয়ে চলার পরামর্শ দিয়েছেন চিকিৎসকরা।</p>",
    body_en:
      "<p>Late-night study is common, but keeping a consistent sleep window helps concentration and memory; doctors advise staying off screens for an hour before bed.</p>",
    thumbnail_url:
      "https://images.unsplash.com/photo-1504701954957-2010ec3bcec1?auto=format&fit=crop&w=1200&q=60",
    thumbnail_alt: "বিছানায় বিশ্রামরত শিক্ষার্থী",
    daysAgo: 4,
    view_count: 300,
    read_time: 3,
  }),
];

export { mockContents };

export function getMockContentBySlug(slug: string): ContentWithRelations | undefined {
  return mockContents.find((c) => c.slug === slug);
}

export function getMockCategory(slug: string): Category | undefined {
  return mockCategories.find((c) => c.slug === slug);
}
