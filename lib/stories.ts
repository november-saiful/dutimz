import { isSupabaseConfigured, supabaseServer, type Story } from "./supabase";

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
    category: "বিশ্ববিদ্যালয়",
    categorySlug: "university",
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

export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}

const STORY_SELECT =
  "id,slug,title,excerpt,author_id,is_anonymous,published_at,hero_media_key,category:categories(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name,avatar_url)";

export async function getLatestStories(limit = 25): Promise<Story[]> {
  if (isDemoMode()) return [];
  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("articles")
      .select(STORY_SELECT)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("Homepage feed is not available yet", error.message);
      return [];
    }
    return (data ?? []) as unknown as Story[];
  } catch (error) {
    console.warn("Homepage feed is not available yet", error);
    return [];
  }
}

export async function getStoryBySlug(
  slug: string,
): Promise<(Story & { body: string }) | null> {
  if (isDemoMode()) return null;
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("articles")
    .select(
      "id,slug,title,excerpt,body,author_id,is_anonymous,hero_media_key,published_at,article_media(media_id,position),category:categories(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name,avatar_url)",
    )
    .eq("status", "published")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("Article fetch failed", error.message);
    return null;
  }
  return data as unknown as (Story & { body: string }) | null;
}

export async function getCategoryStories(slug: string): Promise<{
  title: string;
  description: string;
  stories: Story[];
}> {
  const fallbackTitle = slug;
  if (isDemoMode())
    return { title: fallbackTitle, description: "", stories: [] };
  const supabase = supabaseServer();
  const { data: category } = await supabase
    .from("categories")
    .select("slug,title_bn,description_bn")
    .eq("slug", slug)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (!category)
    return { title: fallbackTitle, description: "", stories: [] };
  const { data } = await supabase
    .from("articles")
    .select(
      "id,slug,title,excerpt,published_at,is_anonymous,hero_media_key,category:categories!inner(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name)",
    )
    .eq("category.slug", slug)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(40);
  return {
    title: (category as { title_bn: string }).title_bn,
    description: (category as { description_bn: string }).description_bn ?? "",
    stories: ((data ?? []) as unknown as Story[]) ?? [],
  };
}

export type DashboardStats = {
  stories: number;
  categories: number;
  authors: number;
  comments: number;
  weekly: { week: string; opened: number; completed: number }[];
  recentActivity: {
    id: string;
    name: string;
    action: string;
    time: string;
    initials: string;
  }[];
};

export async function getDashboardStats(
  stories: Story[],
): Promise<DashboardStats> {
  if (isDemoMode() || !stories.length) {
    return {
      stories: 0,
      categories: 0,
      authors: 0,
      comments: 0,
      weekly: [],
      recentActivity: [],
    };
  }
  const authors = new Set(
    stories.map((s) => s.author_id).filter(Boolean),
  ).size;
  const categories = new Set(
    stories.map((s) => {
      const c = Array.isArray(s.category) ? s.category[0] : s.category;
      return c?.slug;
    }),
  ).size;
  // Weekly throughput from publish dates (last 8 buckets, oldest first).
  const buckets = new Array(8).fill(0) as number[];
  const now = Date.now();
  for (const story of stories) {
    const age = now - new Date(story.published_at).getTime();
    const week = Math.floor(age / (7 * 24 * 3_600_000));
    if (week >= 0 && week < 8) buckets[7 - week] += 1;
  }
  const weekly = buckets.map((completed, i) => ({
    week: `সপ্তাহ ${new Intl.NumberFormat("bn-BD").format(i + 1)}`,
    opened: completed,
    completed,
  }));
  let comments = 0;
  try {
    const supabase = supabaseServer();
    const { count } = await supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("status", "visible");
    comments = count ?? 0;
  } catch {
    comments = 0;
  }
  const recentActivity = stories.slice(0, 5).map((story) => {
    const profile = Array.isArray(story.profiles)
      ? story.profiles[0]
      : story.profiles;
    const name = story.is_anonymous
      ? "নাম প্রকাশে অনিচ্ছুক"
      : profile?.display_name || `@${profile?.username || "পাঠক"}`;
    return {
      id: story.id,
      name,
      action: `প্রকাশ করেছেন: ${story.title}`,
      time: new Date(story.published_at).toLocaleDateString("bn-BD"),
      initials: name.slice(0, 2),
    };
  });
  return {
    stories: stories.length,
    categories,
    authors,
    comments,
    weekly,
    recentActivity,
  };
}
