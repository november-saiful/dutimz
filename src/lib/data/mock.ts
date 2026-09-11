import type { Category, ContentWithRelations } from "@/types";

const iso = (daysAgo: number, hours = 0): string =>
  new Date(Date.now() - daysAgo * 86_400_000 - hours * 3_600_000).toISOString();

export const mockCategories: Category[] = [
  { id: "c1", slug: "politics", name_bn: "রাজনীতি", name_en: "Politics", description: null, parent_id: null, sort_order: 1, is_active: true, created_at: iso(90) },
  { id: "c2", slug: "sports", name_bn: "খেলাধুলা", name_en: "Sports", description: null, parent_id: null, sort_order: 2, is_active: true, created_at: iso(90) },
  { id: "c3", slug: "technology", name_bn: "প্রযুক্তি", name_en: "Technology", description: null, parent_id: null, sort_order: 3, is_active: true, created_at: iso(90) },
  { id: "c4", slug: "economy", name_bn: "অর্থনীতি", name_en: "Economy", description: null, parent_id: null, sort_order: 4, is_active: true, created_at: iso(90) },
  { id: "c5", slug: "culture", name_bn: "সংস্কৃতি", name_en: "Culture", description: null, parent_id: null, sort_order: 5, is_active: true, created_at: iso(90) },
];

interface MockInput {
  id: string;
  slug: string;
  contentType: ContentWithRelations["content_type"];
  titleBn: string;
  titleEn: string;
  excerptBn: string;
  excerptEn: string;
  categorySlug: string;
  featured?: boolean;
  breaking?: boolean;
  views?: number;
  readTime?: number;
  videoUrl?: string;
  daysAgo: number;
}

function buildContent(input: MockInput): ContentWithRelations {
  return {
    id: input.id,
    slug: input.slug,
    content_type: input.contentType,
    content_format: input.videoUrl ? "video" : "text",
    language_primary: "bn",
    title_bn: input.titleBn,
    subtitle_bn: null,
    excerpt_bn: input.excerptBn,
    body_bn: `<p>${input.excerptBn}</p>`,
    title_en: input.titleEn,
    subtitle_en: null,
    excerpt_en: input.excerptEn,
    body_en: `<p>${input.excerptEn}</p>`,
    thumbnail_url: THUMBNAILS[input.id] ?? `https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&q=60`,
    thumbnail_alt: input.titleEn,
    featured_image_url: null,
    video_url: input.videoUrl ?? null,
    video_duration: input.videoUrl ? 540 : null,
    attachments: [],
    category_id: null,
    tags: [],
    author_id: null,
    status: "published",
    published_at: iso(input.daysAgo),
    scheduled_at: null,
    view_count: input.views ?? 0,
    read_time: input.readTime ?? 3,
    meta_title: null,
    meta_description: null,
    og_image_url: null,
    is_featured: input.featured ?? false,
    is_breaking: input.breaking ?? false,
    is_commentable: true,
    allow_notifications: true,
    version: 1,
    parent_version_id: null,
    created_by: null,
    updated_by: null,
    created_at: iso(input.daysAgo),
    updated_at: iso(input.daysAgo),
    category: mockCategories.find((c) => c.slug === input.categorySlug) ?? null,
    author: {
      id: "a1",
      username: "dutimz_desk",
      display_name: "দুতিমজ ডেস্ক",
      avatar_url: null,
      is_verified: true,
    },
  };
}

// Unique Unsplash thumbnails per story (topic-matched, 1200w webp)
const THUMBNAILS: Record<string, string> = {
  "1": "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?auto=format&fit=crop&w=1200&q=60",
  "2": "https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=1200&q=60",
  "3": "https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=1200&q=60",
  "4": "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=60",
  "5": "https://images.unsplash.com/photo-1513415564515-763d91423bdd?auto=format&fit=crop&w=1200&q=60",
  "6": "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?auto=format&fit=crop&w=1200&q=60",
  "7": "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=1200&q=60",
  "8": "https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=1200&q=60",
  "9": "https://images.unsplash.com/photo-1504701954957-2010ec3bcec1?auto=format&fit=crop&w=1200&q=60",
  "10": "https://images.unsplash.com/photo-1564769625905-50e93615e769?auto=format&fit=crop&w=1200&q=60",
};

const inputs: MockInput[] = [
  { id: "1", slug: "dutimz-launches-bilingual-news-portal-2026", contentType: "news", titleBn: "দুতিমজ চালু করল দ্বিভাষিক সংবাদ পোর্টাল", titleEn: "Dutimz launches bilingual news portal", excerptBn: "নতুন প্ল্যাটফর্মে টেক্সট, ভিডিও ও ডকুমেন্টারি — একসাথে বাংলা ও ইংরেজিতে।", excerptEn: "The new platform ships text, video and documentary formats in Bangla and English.", categorySlug: "technology", featured: true, views: 1240, daysAgo: 0 },
  { id: "2", slug: "dhaka-metro-rail-new-timetable", contentType: "news", titleBn: "ঢাকা মেট্রোরেলের নতুন সময়সূচি ঘোষণা", titleEn: "Dhaka Metro Rail announces new timetable", excerptBn: "অফিস টাইমে ট্রেনের ফ্রিকোয়েন্সি বাড়ানো হচ্ছে, জানাল কর্তৃপক্ষ।", excerptEn: "Authorities will increase train frequency during office hours.", categorySlug: "economy", featured: true, breaking: true, views: 2210, daysAgo: 0 },
  { id: "3", slug: "bangladesh-t20-series-squad", contentType: "news", titleBn: "টি-টোয়েন্টি সিরিজের জন্য দল ঘোষণা", titleEn: "Squad announced for T20 series", excerptBn: "সিরিজ শুরু আগামী সপ্তাহে, দলে দুই নতুন মুখ।", excerptEn: "The series starts next week with two debutants in the squad.", categorySlug: "sports", featured: true, views: 1890, daysAgo: 1 },
  { id: "4", slug: "ai-in-bangla-newsrooms", contentType: "article", titleBn: "বাংলা নিউজরুমে কৃত্রিম বুদ্ধিমত্তা", titleEn: "AI in Bangla newsrooms", excerptBn: "সম্পাদকীয় প্রবাহে এআই কতটা এগিয়ে আনতে পারে — গভীর বিশ্লেষণ।", excerptEn: "A deep analysis of how far AI can accelerate editorial workflows.", categorySlug: "technology", featured: true, readTime: 8, views: 980, daysAgo: 1 },
  { id: "5", slug: "padma-bridge-economic-impact", contentType: "article", titleBn: "পদ্মা সেতুর অর্থনৈতিক প্রভাব", titleEn: "The economic impact of Padma Bridge", excerptBn: "দক্ষিণাঞ্চলের বাণিজ্যে সেতুর প্রভাব বিশ্লেষণ।", excerptEn: "Analysing the bridge's effect on southern trade corridors.", categorySlug: "economy", readTime: 6, views: 1420, daysAgo: 2 },
  { id: "6", slug: "monsoon-forecast-this-week", contentType: "news", titleBn: "এই সপ্তাহের বর্ষা পূর্বাভাস", titleEn: "Monsoon forecast for this week", excerptBn: "উপকূলীয় জেলায় ভারী বৃষ্টির সম্ভাবনা।", excerptEn: "Heavy rain likely in coastal districts.", categorySlug: "politics", views: 760, daysAgo: 2 },
  { id: "7", slug: "folk-festival-opens-in-dhaka", contentType: "article", titleBn: "ঢাকায় শুরু হলো লোকজ উৎসব", titleEn: "Folk festival opens in Dhaka", excerptBn: "তিন দিনের উৎসবে থাকছে ভাওয়াইয়া ও ভাটিয়ালি গান।", excerptEn: "The three-day festival features Bhaiaiya and Bhatiali performances.", categorySlug: "culture", views: 640, daysAgo: 3 },
  { id: "8", slug: "youth-startups-raise-funding", contentType: "news", titleBn: "তরুণ উদ্যোক্তাদের স্টার্টআপে বিনিয়োগ", titleEn: "Youth-led startups raise funding", excerptBn: "পাঁচটি স্টার্টআপ মিলে সিড ফান্ডিং পেল।", excerptEn: "Five startups collectively closed seed rounds.", categorySlug: "economy", views: 540, daysAgo: 3 },
  { id: "9", slug: "documentary-the-rivers-of-bengal", contentType: "documentary", titleBn: "প্রামাণ্যচিত্র: বাংলার নদী", titleEn: "Documentary: The Rivers of Bengal", excerptBn: "নদী, জীবন ও টেকসই ভবিষ্যৎ — একটি ভিজ্যুয়াল যাত্রা।", excerptEn: "Rivers, life and a sustainable future — a visual journey.", categorySlug: "culture", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", views: 3120, daysAgo: 4 },
  { id: "10", slug: "documentary-tea-garden-workers", contentType: "documentary", titleBn: "প্রামাণ্যচিত্র: চা-বাগানের জীবন", titleEn: "Documentary: Life in tea gardens", excerptBn: "চা-বাগানের শ্রমিকদের প্রতিদিনের গল্প।", excerptEn: "A day-in-the-life story of tea garden workers.", categorySlug: "culture", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", views: 1580, daysAgo: 5 },
];

export const mockContents: ContentWithRelations[] = inputs.map(buildContent);

export function getMockContentBySlug(slug: string): ContentWithRelations | undefined {
  return mockContents.find((c) => c.slug === slug);
}

export function getMockCategory(slug: string): Category | undefined {
  return mockCategories.find((c) => c.slug === slug);
}
