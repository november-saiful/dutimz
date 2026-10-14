import { reportError } from "./errors";
import { CATEGORIES, mediaUrlFor } from "./site";
import { isSupabaseConfigured, supabaseServer, type Story } from "./supabase";

/*
  The demo fixtures themselves live in `lib/preview.ts`, which imports nothing at
  all: both profile pages read them from a *client* component, and this module
  reaches for the server-side Supabase client, so a browser bundle importing the
  fixtures from here would drag that graph in with them. Re-exported, so every
  existing import — the front page's — keeps working unchanged.
*/
export { previewStories, type PreviewStory } from "./preview";

export function isDemoMode(): boolean {
  return !isSupabaseConfigured();
}

const STORY_SELECT =
  "id,slug,title,excerpt,author_id,is_anonymous,published_at,hero_media_key,category:categories(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name,avatar_url)";

/**
 * The picture a share carries: the story's hero, else its first gallery image, else the site
 * banner.
 *
 * One rule in one place, because Next replaces a page's `openGraph` rather than merging it — a
 * reading surface that forgot to name its own picture would hand Facebook the layout's text logo
 * and let it fall back to the favicon. The article page and the reel deck both take it from here.
 */
export function shareImageFor(
  story: Pick<Story, "hero_media_key" | "article_media">,
): string {
  const key =
    story.hero_media_key ??
    (story.article_media ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)[0]?.media_id ??
    null;
  return key ? mediaUrlFor(key) : "/og-banner.png";
}

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

/**
 * True when some article — published or not — has claimed this slug.
 *
 * `getStoryBySlug` is filtered to published rows, so it cannot tell "no such story" (a real 404)
 * apart from "a story that exists but is not live yet" (which the author and the desk may
 * preview). This asks only whether the slug is taken, and shares nothing about the article.
 */
export async function articleSlugExists(slug: string): Promise<boolean> {
  if (isDemoMode() || !slug) return false;
  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase.rpc("article_slug_exists", {
      p_slug: slug,
    });
    if (error) {
      reportError("article slug lookup", error);
      return false;
    }
    return data === true;
  } catch (error) {
    reportError("article slug lookup", error);
    return false;
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
    const { count, error } = await supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("status", "visible");
    if (error) reportError("dashboard comment count", error);
    comments = count ?? 0;
  } catch (error) {
    reportError("dashboard comment count", error);
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
