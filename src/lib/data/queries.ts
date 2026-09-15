import type { Category, ContentWithRelations } from "@/types";
import {
  mockCategories,
  mockContents,
  getMockCategory,
} from "@/lib/data/mock";

/**
 * Phase 1 data access. When Supabase env vars are present these helpers query
 * Supabase; otherwise they fall back to mock data so the UI is fully
 * navigable during development. Phase 3 will replace fallbacks with real data.
 */

function hasSupabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export async function getLatestContents(
  limit: number,
): Promise<ContentWithRelations[]> {
  if (!hasSupabase()) {
    return mockContents
      .filter((c) => c.status === "published")
      .slice(0, limit);
  }
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contents")
    .select("*, category:categories(*), author:profiles!contents_author_id_fkey(id, username, display_name, avatar_url, is_verified)")
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as ContentWithRelations[];
}

export async function getFeaturedContents(
  limit: number,
): Promise<ContentWithRelations[]> {
  if (!hasSupabase()) {
    return mockContents
      .filter((c) => c.status === "published" && c.is_featured)
      .slice(0, limit);
  }
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contents")
    .select("*, category:categories(*), author:profiles!contents_author_id_fkey(id, username, display_name, avatar_url, is_verified)")
    .eq("status", "published")
    .eq("is_featured", true)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as ContentWithRelations[];
}

export async function getBreakingContents(
  limit: number,
): Promise<ContentWithRelations[]> {
  if (!hasSupabase()) {
    return mockContents.filter((c) => c.is_breaking).slice(0, limit);
  }
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contents")
    .select("*, category:categories(*)")
    .eq("status", "published")
    .eq("is_breaking", true)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as ContentWithRelations[];
}

export async function getPopularContents(
  limit: number,
): Promise<ContentWithRelations[]> {
  if (!hasSupabase()) {
    return [...mockContents]
      .sort((a, b) => b.view_count - a.view_count)
      .slice(0, limit);
  }
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contents")
    .select("*, category:categories(*), author:profiles!contents_author_id_fkey(id, username, display_name, avatar_url, is_verified)")
    .eq("status", "published")
    .order("view_count", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as ContentWithRelations[];
}

export async function getDocumentarySpotlight(): Promise<
  ContentWithRelations | null
> {
  if (!hasSupabase()) {
    return (
      mockContents.find((c) => c.content_type === "documentary") ?? null
    );
  }
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("contents")
    .select("*, category:categories(*), author:profiles!contents_author_id_fkey(id, username, display_name, avatar_url, is_verified)")
    .eq("status", "published")
    .eq("content_type", "documentary")
    .order("view_count", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as unknown as ContentWithRelations) ?? null;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  if (!hasSupabase()) return getMockCategory(slug) ?? null;
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return (data as unknown as Category) ?? null;
}

export async function getActiveCategories(): Promise<Category[]> {
  if (!hasSupabase()) return mockCategories;
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data as unknown as Category[];
}

export async function getContentsByCategory(
  categorySlug: string,
  limit: number,
  /** Pass the category ID to skip the redundant getCategoryBySlug lookup. */
  categoryId?: string,
): Promise<ContentWithRelations[]> {
  if (!hasSupabase()) {
    return mockContents
      .filter((c) => c.category?.slug === categorySlug)
      .slice(0, limit);
  }
  const catId = categoryId ?? (await getCategoryBySlug(categorySlug))?.id;
  if (!catId) return [];
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contents")
    .select("*, category:categories(*), author:profiles!contents_author_id_fkey(id, username, display_name, avatar_url, is_verified)")
    .eq("status", "published")
    .eq("category_id", catId)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as ContentWithRelations[];
}

export async function getContentBySlug(
  slug: string,
): Promise<ContentWithRelations | null> {
  if (!hasSupabase()) {
    const { getMockContentBySlug } = await import("@/lib/data/mock");
    return getMockContentBySlug(slug) ?? null;
  }
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("contents")
    .select("*, category:categories(*), author:profiles!contents_author_id_fkey(id, username, display_name, avatar_url, is_verified)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return (data as unknown as ContentWithRelations) ?? null;
}

export async function getRelatedContents(
  content: ContentWithRelations,
  limit: number,
): Promise<ContentWithRelations[]> {
  const all = await getLatestContents(50);
  const sameCategory = all.filter(
    (c) => c.id !== content.id && c.category?.id === content.category?.id,
  );
  const fallback = all.filter(
    (c) => c.id !== content.id && c.category?.id !== content.category?.id,
  );
  return [...sameCategory, ...fallback].slice(0, limit);
}
