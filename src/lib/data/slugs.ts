/**
 * Shared slug list for generateStaticParams on public [slug] pages.
 * In Supabase mode, fetches the most recent published slugs.
 * In mock mode, returns the seeded slugs.
 */

import { hasSupabase } from "@/lib/data/deskApi";

const MAX_STATIC_SLUGS = 50;

export async function getStaticSlugs(): Promise<{ slug: string }[]> {
  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = createSupabaseServerClient();
    const { data } = await supabase
      .from("contents")
      .select("slug")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(MAX_STATIC_SLUGS);
    return (data ?? []).map((r: { slug: string }) => ({ slug: r.slug }));
  }

  const { mockContents } = await import("@/lib/data/mock");
  return mockContents
    .filter((c) => c.status === "published")
    .slice(0, MAX_STATIC_SLUGS)
    .map((c) => ({ slug: c.slug }));
}

export async function getStaticCategorySlugs(): Promise<{ slug: string }[]> {
  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = createSupabaseServerClient();
    const { data } = await supabase
      .from("categories")
      .select("slug")
      .eq("is_active", true)
      .order("sort_order");
    return (data ?? []).map((r: { slug: string }) => ({ slug: r.slug }));
  }

  const { mockCategories } = await import("@/lib/data/mock");
  return mockCategories.map((c) => ({ slug: c.slug }));
}
