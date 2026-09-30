import { NextResponse } from "next/server";

import type { SearchHit, SearchResponse } from "@/lib/search";
import { reportError } from "@/lib/errors";
import { isDemoMode, previewStories } from "@/lib/stories";
import { supabaseServer, storyCategory, type Story } from "@/lib/supabase";

/*
  The search behind the command palette.

  It runs on the server for two reasons. The archive query needs the anonymous
  server client (the same `search_public_articles` RPC the search page calls, so
  the two can never drift), and demo builds have no database at all — they fall
  back to the same preview stories the home feed shows, which keeps the palette
  working in every pull-request preview.
*/
const LIMIT = 8;
const MAX_QUERY = 80;

function hitFrom(row: Story): SearchHit {
  const category = storyCategory(row);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? "",
    category: category.title_bn,
    categorySlug: category.slug,
    publishedAt: row.published_at ?? null,
  };
}

/** Preview hits are already in the bundle, so they are matched in memory. */
function previewHits(query: string): SearchHit[] {
  const needle = query.toLowerCase();
  return previewStories
    .filter((story) =>
      `${story.title} ${story.excerpt} ${story.category} ${story.slug}`
        .toLowerCase()
        .includes(needle),
    )
    .slice(0, LIMIT)
    .map((story) => ({
      id: story.slug,
      slug: story.slug,
      title: story.title,
      excerpt: story.excerpt,
      category: story.category,
      categorySlug: story.categorySlug,
      publishedAt: null,
    }));
}

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .slice(0, MAX_QUERY);
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (!query) {
    return NextResponse.json<SearchResponse>(
      { demo: isDemoMode(), results: [] },
      { headers },
    );
  }

  if (isDemoMode()) {
    return NextResponse.json<SearchResponse>(
      { demo: true, results: previewHits(query) },
      { headers },
    );
  }

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase.rpc("search_public_articles", {
      p_query: query,
      p_limit: LIMIT,
    });
    if (error) {
      reportError("palette search", error);
      return NextResponse.json<SearchResponse>(
        { demo: false, unavailable: true, results: [] },
        { headers },
      );
    }
    return NextResponse.json<SearchResponse>(
      { demo: false, results: ((data ?? []) as Story[]).map(hitFrom) },
      { headers },
    );
  } catch (error) {
    reportError("palette search", error);
    return NextResponse.json<SearchResponse>(
      { demo: false, unavailable: true, results: [] },
      { headers },
    );
  }
}
