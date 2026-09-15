import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 },
    );
  }

  const limit = Math.min(
    Number(url.searchParams.get("limit") ?? 8) || 8,
    20,
  );

  // Optional filters
  const contentType = url.searchParams.get("type")?.trim() || null;
  const categoryId = url.searchParams.get("category")?.trim() || null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase is not configured, return mock search results
  if (!supabaseUrl || !supabaseKey) {
    const { searchContents } = await import("@/lib/content/search");
    const result = await searchContents(q, limit);
    return NextResponse.json(result);
  }

  // Query Supabase directly with public anon key (no cookies needed)
  const pattern = `%${q}%`;
  const select =
    "*,category:categories(*),author:profiles!contents_author_id_fkey(id,username,display_name,avatar_url,is_verified)";

  // Build filters
  const filters: string[] = ["status=eq.published"];
  if (contentType) {
    filters.push(`content_type=eq.${contentType}`);
  }
  if (categoryId) {
    filters.push(`category_id=eq.${categoryId}`);
  }

  const rest =
    `${supabaseUrl}/rest/v1/contents?select=${encodeURIComponent(select)}` +
    `&${filters.join("&")}` +
    `&or=(title_bn.ilike.${encodeURIComponent(pattern)},title_en.ilike.${encodeURIComponent(pattern)},excerpt_bn.ilike.${encodeURIComponent(pattern)},excerpt_en.ilike.${encodeURIComponent(pattern)})` +
    `&order=published_at.desc&limit=${limit}`;

  try {
    const res = await fetch(rest, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "count=exact",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ items: [], total: 0, query: q });
    }

    const items = await res.json();
    const total = Number(res.headers.get("content-range")?.split("/")[1]) ?? items.length;

    return NextResponse.json({ items, total, query: q });
  } catch {
    return NextResponse.json({ items: [], total: 0, query: q });
  }
}
