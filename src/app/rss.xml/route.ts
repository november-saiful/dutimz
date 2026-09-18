export const runtime = "edge";

/**
 * GET /rss.xml — RSS 2.0 feed of recent published content.
 * Pulls from Supabase when available, falls back to mock data.
 */

const BASE_URL = "https://dutimz.com";

interface FeedItem {
  slug: string;
  title: string;
  excerpt: string;
  type: string;
  publishedAt: string;
}

async function getItems(): Promise<FeedItem[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const rest =
        `${supabaseUrl}/rest/v1/contents?select=slug,title_bn,excerpt_bn,content_type,published_at` +
        `&status=eq.published&order=published_at.desc&limit=30`;

      const res = await fetch(rest, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      });

      if (res.ok) {
        const data = (await res.json()) as {
          slug: string;
          title_bn: string;
          excerpt_bn: string | null;
          content_type: string;
          published_at: string | null;
        }[];

        return data.map((item) => ({
          slug: item.slug,
          title: item.title_bn,
          excerpt: item.excerpt_bn ?? "",
          type: item.content_type,
          publishedAt: item.published_at ?? new Date().toISOString(),
        }));
      }
    } catch {
      // Fall through to mock
    }
  }

  const { mockContents } = await import("@/lib/data/mock");
  return mockContents
    .filter((c) => c.status === "published")
    .slice(0, 30)
    .map((c) => ({
      slug: c.slug,
      title: c.title_bn,
      excerpt: c.excerpt_bn ?? "",
      type: c.content_type,
      publishedAt: c.published_at ?? new Date().toISOString(),
    }));
}

const TYPE_ROUTES: Record<string, string> = {
  news: "/news",
  article: "/articles",
  documentary: "/documentaries",
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const items = await getItems();

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>DUTIMZ — ঢাকা ইউনিভার্সিটি টাইম্‌জ</title>
    <link>${BASE_URL}</link>
    <description>সংবাদ, বিশ্লেষণ, প্রতিদিন — News, analysis, every day</description>
    <language>bn</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${BASE_URL}/rss.xml" rel="self" type="application/rss+xml" />
${items
  .map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${BASE_URL}${TYPE_ROUTES[item.type] ?? "/news"}/${escapeXml(item.slug)}</link>
      <guid isPermaLink="true">${BASE_URL}${TYPE_ROUTES[item.type] ?? "/news"}/${escapeXml(item.slug)}</guid>
      <description>${escapeXml(item.excerpt)}</description>
      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=900",
    },
  });
}
