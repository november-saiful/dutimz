/**
 * Phase 4 full-text search. When Supabase is available it uses the
 * pg_trgm / tsvector index created in migration 0006. In mock mode it
 * does a simple case-insensitive substring match across title/body/excerpt.
 */
import type { ContentWithRelations } from "@/types";

function hasSupabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export interface SearchResult {
  items: ContentWithRelations[];
  total: number;
  query: string;
}

export async function searchContents(
  query: string,
  limit = 20,
  offset = 0,
): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { items: [], total: 0, query: q };

  if (!hasSupabase()) {
    return searchMock(q, limit, offset);
  }

  return searchSupabase(q, limit, offset);
}

// ── Supabase full-text search ───────────────────────────────────────

async function searchSupabase(
  q: string,
  limit: number,
  offset: number,
): Promise<SearchResult> {
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServerClient();

  // Use the tsvector search with websearch-to-tsquery
  const { data, error, count } = await supabase
    .from("contents")
    .select(
      "*, category:categories(*), author:profiles(id, username, display_name, avatar_url, is_verified)",
      { count: "exact" },
    )
    .eq("status", "published")
    .textSearch("search_vector", q, { type: "websearch" })
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !data) {
    // Fallback to trigram-like LIKE search if tsvector fails
    return searchSupabaseLike(q, limit, offset);
  }

  return {
    items: data as unknown as ContentWithRelations[],
    total: count ?? data.length,
    query: q,
  };
}

// Fallback: ILIKE search across key columns
async function searchSupabaseLike(
  q: string,
  limit: number,
  offset: number,
): Promise<SearchResult> {
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServerClient();
  const pattern = `%${q}%`;

  const { data, error } = await supabase
    .from("contents")
    .select(
      "*, category:categories(*), author:profiles(id, username, display_name, avatar_url, is_verified)",
    )
    .eq("status", "published")
    .or(
      `title_bn.ilike.${pattern},title_en.ilike.${pattern},excerpt_bn.ilike.${pattern},excerpt_en.ilike.${pattern},body_bn.ilike.${pattern},body_en.ilike.${pattern}`,
    )
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !data) return { items: [], total: 0, query: q };
  return {
    items: data as unknown as ContentWithRelations[],
    total: data.length,
    query: q,
  };
}

// ── Mock search ─────────────────────────────────────────────────────

async function searchMock(
  q: string,
  limit: number,
  offset: number,
): Promise<SearchResult> {
  const { mockContents } = await import("@/lib/data/mock");
  const lower = q.toLowerCase();

  const matches = mockContents.filter((c) => {
    const haystack = [
      c.title_bn,
      c.title_en,
      c.excerpt_bn,
      c.excerpt_en,
      c.body_bn,
      c.body_en,
      c.category?.name_bn,
      c.category?.name_en,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(lower);
  });

  // Score: title match > excerpt match > body match
  const scored = matches.map((c) => {
    let score = 0;
    const title = `${c.title_bn} ${c.title_en}`.toLowerCase();
    const excerpt = `${c.excerpt_bn} ${c.excerpt_en}`.toLowerCase();
    if (title.includes(lower)) score += 10;
    if (excerpt.includes(lower)) score += 5;
    score += c.view_count / 1000;
    return { item: c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const items = scored.slice(offset, offset + limit).map((s) => s.item);

  return { items, total: matches.length, query: q };
}
