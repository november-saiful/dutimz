import { reportError } from "./errors";
import { CATEGORIES } from "./site";
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
      reportError("homepage feed", error);
      return [];
    }
    return (data ?? []) as unknown as Story[];
  } catch (error) {
    reportError("homepage feed", error);
    return [];
  }
}

export async function getStoryBySlug(
  slug: string,
): Promise<(Story & { body: string }) | null> {
  if (isDemoMode()) return null;
  try {
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
      reportError("article fetch", error);
      return null;
    }
    return data as unknown as (Story & { body: string }) | null;
  } catch (error) {
    reportError("article fetch", error);
    return null;
  }
}

/** One question's answer as a reader sees it: choices with what was ticked, or a headcount or number. */
export type ArticleQuestionnaireField =
  | {
      id: string;
      label: string;
      type: "single" | "multi";
      choices: { label: string; selected: boolean }[];
    }
  | { id: string; label: string; type: "people" | "number"; count: number };

export type ArticleQuestionnaire = { fields: ArticleQuestionnaireField[] };

/**
 * The answer sheet of one published story, from `get_public_article_questionnaire`. Free text and the
 * people's names are never returned by that function, so nothing here can name a person.
 */
export async function getArticleQuestionnaire(
  articleId: string,
): Promise<ArticleQuestionnaire | null> {
  if (isDemoMode()) return null;
  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase.rpc("get_public_article_questionnaire", {
      p_article_id: articleId,
    });
    if (error) {
      reportError("article questionnaire", error);
      return null;
    }
    const summary = data as ArticleQuestionnaire | null;
    return summary && summary.fields.length > 0 ? summary : null;
  } catch (error) {
    reportError("article questionnaire", error);
    return null;
  }
}

export async function getCategoryStories(slug: string): Promise<{
  title: string;
  description: string;
  stories: Story[];
}> {
  const fallbackTitle = slug;
  if (isDemoMode())
    return { title: fallbackTitle, description: "", stories: [] };
  try {
    const supabase = supabaseServer();
    const { data: category, error: categoryError } = await supabase
      .from("categories")
      .select("slug,title_bn,description_bn")
      .eq("slug", slug)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (categoryError) {
      reportError("category lookup", categoryError);
      return { title: fallbackTitle, description: "", stories: [] };
    }
    if (!category)
      return { title: fallbackTitle, description: "", stories: [] };
    const { data, error: articlesError } = await supabase
      .from("articles")
      .select(
        "id,slug,title,excerpt,published_at,is_anonymous,hero_media_key,category:categories!inner(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name)",
      )
      .eq("category.slug", slug)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(40);
    if (articlesError) reportError("category stories", articlesError);
    return {
      title: (category as { title_bn: string }).title_bn,
      description: (category as { description_bn: string }).description_bn ?? "",
      stories: ((data ?? []) as unknown as Story[]) ?? [],
    };
  } catch (error) {
    reportError("category stories", error);
    return { title: fallbackTitle, description: "", stories: [] };
  }
}

export type SitemapArticle = {
  slug: string;
  published_at: string;
  updated_at: string | null;
};

/**
 * Every published article, newest first, for the sitemap.
 *
 * Demo mode and a failed query both return nothing rather than throwing: a sitemap listing
 * only the static pages is a far better failure than an unreachable database taking a build
 * or a release down with it.
 */
export async function getSitemapArticles(
  limit = 5000,
): Promise<SitemapArticle[]> {
  if (isDemoMode()) return [];
  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("articles")
      .select("slug,published_at,updated_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) {
      reportError("sitemap article list", error);
      return [];
    }
    return (data ?? []) as unknown as SitemapArticle[];
  } catch (error) {
    reportError("sitemap article list", error);
    return [];
  }
}

/**
 * The masthead's section bar: every active desk in the database in the editor's order, with the
 * front page first. Demo mode and a failed query fall back to the static list so the bar never
 * renders empty.
 */
export async function getNavCategories(): Promise<
  { slug: string; label: string }[]
> {
  const fallback = CATEGORIES.map((c) => ({ slug: c.slug, label: c.label }));
  if (isDemoMode()) return fallback;
  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("categories")
      .select("slug,title_bn")
      .eq("active", true)
      .order("sort_order");
    if (error) {
      reportError("section navigation", error);
      return fallback;
    }
    return [
      { slug: "all", label: "সব খবর" },
      ...((data ?? []) as { slug: string; title_bn: string }[]).map((row) => ({
        slug: row.slug,
        label: row.title_bn,
      })),
    ];
  } catch (error) {
    reportError("section navigation", error);
    return fallback;
  }
}

/** The sections that are actually live, so a retired one is never advertised. */
export async function getSitemapCategorySlugs(): Promise<string[]> {
  if (isDemoMode()) return [];
  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("categories")
      .select("slug")
      .eq("active", true)
      .order("slug");
    if (error) {
      reportError("sitemap section list", error);
      return [];
    }
    return ((data ?? []) as { slug: string }[]).map((row) => row.slug);
  } catch (error) {
    reportError("sitemap section list", error);
    return [];
  }
}
