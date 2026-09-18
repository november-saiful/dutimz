/**
 * DUTIMZ Cloudflare Worker — Full Edge API
 * Public reads, comments, bookmarks, search, polls, newsletter.
 * All backed by Supabase REST API. Rate-limited per IP.
 */

/// <reference types="@cloudflare/workers-types" />

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  IMAGES: R2Bucket;
}

interface Route {
  method: string;
  pattern: RegExp;
  bucket: "public" | "search" | "write";
  handler: (
    request: Request,
    env: Env,
    params: Record<string, string>,
  ) => Promise<Response>;
}

const RATE_LIMITS = {
  public: { requests: 100, window: 60 },
  search: { requests: 60, window: 60 },
  write: { requests: 30, window: 60 },
} as const;

// Best-effort per-IP limiter (per-isolate; Durable Objects for production).
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, limit: { requests: number; window: number }): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + limit.window * 1000 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit.requests;
}

const routes: Route[] = [];

function addRoute(
  method: string,
  pattern: string,
  bucket: Route["bucket"],
  handler: Route["handler"],
): void {
  const regex = new RegExp(
    "^" + pattern.replace(/:([a-zA-Z]+)/g, (_, name: string) => `(?<${name}>[^/]+)`) + "$",
  );
  routes.push({ method, pattern: regex, bucket, handler });
}

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
  };
}

function supabaseHeaders(env: Env): HeadersInit {
  return {
    apikey: env.SUPABASE_ANON_KEY,
    authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

function serviceHeaders(env: Env): HeadersInit {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC READ ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

addRoute("GET", "/api/contents", "public", async (request, env) => {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 50);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  let rest =
    `${env.SUPABASE_URL}/rest/v1/contents?select=*,category:categories(*),author:profiles(id,username,display_name,avatar_url,is_verified)` +
    `&status=eq.published&published_at=lte.${new Date().toISOString()}` +
    `&order=published_at.desc&limit=${limit}&offset=${offset}`;
  const category = url.searchParams.get("category");
  if (category) rest += `&category_id=eq.${encodeURIComponent(category)}`;
  const type = url.searchParams.get("type");
  if (type) rest += `&content_type=eq.${encodeURIComponent(type)}`;

  const res = await fetch(rest, { headers: supabaseHeaders(env) });
  const data = await res.json();
  return json({ data }, res.ok ? 200 : 502, { "cache-control": "public, max-age=60, s-maxage=300" });
});

addRoute("GET", "/api/contents/featured", "public", async (_request, env) => {
  const rest =
    `${env.SUPABASE_URL}/rest/v1/contents?select=*,category:categories(*),author:profiles(id,username,display_name,avatar_url,is_verified)` +
    `&status=eq.published&is_featured=eq.true&order=published_at.desc&limit=5`;
  const res = await fetch(rest, { headers: supabaseHeaders(env) });
  return json(await res.json(), res.ok ? 200 : 502, { "cache-control": "public, max-age=120, s-maxage=600" });
});

addRoute("GET", "/api/contents/popular", "public", async (request, env) => {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10) || 10, 20);
  const rest =
    `${env.SUPABASE_URL}/rest/v1/contents?select=*,category:categories(*),author:profiles(id,username,display_name,avatar_url,is_verified)` +
    `&status=eq.published&order=view_count.desc&limit=${limit}`;
  const res = await fetch(rest, { headers: supabaseHeaders(env) });
  return json(await res.json(), res.ok ? 200 : 502, { "cache-control": "public, max-age=300, s-maxage=900" });
});

addRoute("GET", "/api/contents/:slug", "public", async (_request, env, params) => {
  const rest =
    `${env.SUPABASE_URL}/rest/v1/contents?select=*,category:categories(*),author:profiles(id,username,display_name,avatar_url,is_verified)` +
    `&slug=eq.${encodeURIComponent(params.slug ?? "")}&status=eq.published&limit=1`;
  const res = await fetch(rest, { headers: supabaseHeaders(env) });
  const data = (await res.json()) as unknown[];
  if (!Array.isArray(data) || data.length === 0) {
    return json({ error: "not_found" }, 404);
  }
  // Increment view count (fire-and-forget)
  const contentId = (data[0] as { id: string }).id;
  fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/increment_view_count?p_content_id=${contentId}`,
    { method: "POST", headers: supabaseHeaders(env) },
  ).catch(() => {});
  return json({ data: data[0] }, 200, { "cache-control": "public, max-age=30, s-maxage=120" });
});

addRoute("GET", "/api/categories", "public", async (_request, env) => {
  const rest =
    `${env.SUPABASE_URL}/rest/v1/categories?select=*` +
    `&is_active=eq.true&order=sort_order.asc`;
  const res = await fetch(rest, { headers: supabaseHeaders(env) });
  return json(await res.json(), res.ok ? 200 : 502, { "cache-control": "public, max-age=600, s-maxage=3600" });
});

// ═══════════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════════

addRoute("GET", "/api/search", "search", async (request, env) => {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return json({ error: "Query must be at least 2 characters" }, 400);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 50);

  // Try tsvector full-text search first, fall back to ILIKE
  const rest =
    `${env.SUPABASE_URL}/rest/v1/rpc/search_contents` +
    `?q=${encodeURIComponent(q)}&p_limit=${limit}`;
  const res = await fetch(rest, { headers: supabaseHeaders(env) });
  if (res.ok) {
    const data = (await res.json()) as unknown[];
    return json({ items: data, total: data.length, query: q });
  }

  // Fallback: ILIKE across title/excerpt
  const pattern = `%${q}%`;
  const fallback =
    `${env.SUPABASE_URL}/rest/v1/contents?select=*,category:categories(*),author:profiles(id,username,display_name,avatar_url,is_verified)` +
    `&status=eq.published` +
    `&or=(title_bn.ilike.${encodeURIComponent(pattern)},title_en.ilike.${encodeURIComponent(pattern)},excerpt_bn.ilike.${encodeURIComponent(pattern)},excerpt_en.ilike.${encodeURIComponent(pattern)})` +
    `&order=published_at.desc&limit=${limit}`;
  const fallbackRes = await fetch(fallback, { headers: supabaseHeaders(env) });
  const fallbackData = (await fallbackRes.json()) as unknown[];
  return json({ items: fallbackData, total: fallbackData.length, query: q });
});

// ═══════════════════════════════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════════════════════════════

addRoute("GET", "/api/comments", "public", async (request, env) => {
  const url = new URL(request.url);
  const contentId = url.searchParams.get("contentId");
  if (!contentId) return json({ error: "contentId is required" }, 400);

  const rest =
    `${env.SUPABASE_URL}/rest/v1/comments?select=*` +
    `&content_id=eq.${encodeURIComponent(contentId)}&status=eq.approved` +
    `&order=created_at.asc`;
  const res = await fetch(rest, { headers: supabaseHeaders(env) });
  return json({ comments: await res.json() }, res.ok ? 200 : 502);
});

addRoute("POST", "/api/comments", "write", async (request, env) => {
  const body = (await request.json()) as {
    contentId?: string;
    parentId?: string | null;
    authorName?: string;
    body?: string;
  };
  if (!body.contentId || !body.authorName?.trim() || !body.body?.trim()) {
    return json({ error: "contentId, authorName, and body are required" }, 400);
  }

  // Calculate depth from parent
  let depth = 0;
  if (body.parentId) {
    const parentRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/comments?select=depth&id=eq.${encodeURIComponent(body.parentId)}`,
      { headers: supabaseHeaders(env) },
    );
    const parents = (await parentRes.json()) as { depth: number }[];
    if (parents.length > 0) depth = Math.min(parents[0].depth + 1, 3);
  }

  const rest = `${env.SUPABASE_URL}/rest/v1/comments`;
  const res = await fetch(rest, {
    method: "POST",
    headers: serviceHeaders(env),
    body: JSON.stringify({
      content_id: body.contentId,
      parent_id: body.parentId ?? null,
      author_name: body.authorName.trim(),
      body: body.body.trim(),
      status: "approved",
      depth,
    }),
  });
  const data = await res.json();
  return json({ comment: data }, res.ok ? 201 : 502);
});

addRoute("POST", "/api/comments/react", "write", async (request, env) => {
  const body = (await request.json()) as { commentId?: string; reaction?: string };
  if (!body.commentId || !["like", "dislike"].includes(body.reaction ?? "")) {
    return json({ error: "commentId and reaction (like|dislike) are required" }, 400);
  }

  const column = body.reaction === "like" ? "likes" : "dislikes";
  const rest = `${env.SUPABASE_URL}/rest/v1/rpc/increment_comment_${column}?p_comment_id=${encodeURIComponent(body.commentId)}`;
  const res = await fetch(rest, { method: "POST", headers: supabaseHeaders(env) });
  return json({ ok: res.ok }, res.ok ? 200 : 502);
});

// ═══════════════════════════════════════════════════════════════════
// BOOKMARKS
// ═══════════════════════════════════════════════════════════════════

addRoute("GET", "/api/bookmarks", "write", async (request, env) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return json({ error: "userId is required" }, 400);

  const rest =
    `${env.SUPABASE_URL}/rest/v1/bookmarks?select=content_id` +
    `&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`;
  const res = await fetch(rest, { headers: supabaseHeaders(env) });
  const data = (await res.json()) as { content_id: string }[];
  return json({ contentIds: data.map((d) => d.content_id) }, res.ok ? 200 : 502);
});

addRoute("POST", "/api/bookmarks", "write", async (request, env) => {
  const body = (await request.json()) as { userId?: string; contentId?: string };
  if (!body.userId || !body.contentId) {
    return json({ error: "userId and contentId are required" }, 400);
  }

  // Check if bookmark exists
  const checkRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/bookmarks?select=id` +
      `&user_id=eq.${encodeURIComponent(body.userId)}&content_id=eq.${encodeURIComponent(body.contentId)}`,
    { headers: supabaseHeaders(env) },
  );
  const existing = (await checkRes.json()) as { id: string }[];

  if (existing.length > 0) {
    // Remove bookmark
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/bookmarks?id=eq.${existing[0].id}`,
      { method: "DELETE", headers: serviceHeaders(env) },
    );
    return json({ bookmarked: false });
  }

  // Add bookmark
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/bookmarks`, {
    method: "POST",
    headers: serviceHeaders(env),
    body: JSON.stringify({
      user_id: body.userId,
      content_id: body.contentId,
    }),
  });
  return json({ bookmarked: res.ok }, res.ok ? 201 : 502);
});

// ═══════════════════════════════════════════════════════════════════
// NEWSLETTER
// ═══════════════════════════════════════════════════════════════════

addRoute("POST", "/api/newsletter/subscribe", "write", async (request, env) => {
  const body = (await request.json()) as { email?: string; locale?: string };
  if (!body.email || typeof body.email !== "string" || !body.email.includes("@")) {
    return json({ error: "A valid email is required" }, 400);
  }

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/newsletter_subscribers`, {
    method: "POST",
    headers: serviceHeaders(env),
    body: JSON.stringify({
      email: body.email.trim().toLowerCase(),
      locale: body.locale ?? "bn",
    }),
  });

  if (res.ok) return json({ ok: true, message: "subscribed" });
  const err = await res.json().catch(() => ({}));
  // Unique constraint violation = already subscribed
  if ((err as { code?: string }).code === "23505") {
    return json({ ok: true, message: "already_subscribed" });
  }
  return json({ ok: false, message: "subscription_failed" }, 502);
});

// ═══════════════════════════════════════════════════════════════════
// POLLS
// ═══════════════════════════════════════════════════════════════════

addRoute("GET", "/api/polls", "public", async (_request, env) => {
  // Polls would live in a polls table; for now return empty
  return json({ polls: [] });
});

addRoute("POST", "/api/polls/vote", "write", async (request, env) => {
  const body = (await request.json()) as { pollId?: string; optionId?: string };
  if (!body.pollId || !body.optionId) {
    return json({ error: "pollId and optionId are required" }, 400);
  }
  // Placeholder — polls table would be created in a future migration
  return json({ ok: true, message: "vote_recorded" });
});

// ═══════════════════════════════════════════════════════════════════
// IMAGE UPLOADS (R2)
// ═══════════════════════════════════════════════════════════════════

addRoute("POST", "/api/images/upload", "write", async (request, env) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    return json({ error: "Expected multipart/form-data" }, 400);
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string) || "thumbnails";

  if (!file) {
    return json({ error: "No file provided" }, 400);
  }

  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    return json({ error: "Unsupported file type. Allowed: JPEG, PNG, WebP, AVIF, GIF" }, 400);
  }

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    return json({ error: "File too large. Maximum size: 10MB" }, 400);
  }

  // Generate unique key
  const ext = file.name.split(".").pop() ?? "jpg";
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const key = `${folder}/${timestamp}-${random}.${ext}`;

  // Upload to R2
  const arrayBuffer = await file.arrayBuffer();
  await env.IMAGES.put(key, arrayBuffer, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  });

  // Return the public URL
  const publicUrl = `https://dutimz-images.r2.dev/${key}`;
  return json({ url: publicUrl, key }, 201);
});

addRoute("GET", "/api/images/:key+", "public", async (_request, env, params) => {
  const key = params.key;
  if (!key) return json({ error: "Key is required" }, 400);

  const object = await env.IMAGES.get(key);
  if (!object) return json({ error: "Image not found" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
});

addRoute("DELETE", "/api/images/:key+", "write", async (_request, env, params) => {
  const key = params.key;
  if (!key) return json({ error: "Key is required" }, 400);

  await env.IMAGES.delete(key);
  return json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// ENTRYPOINT
// ═══════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get("origin"));

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

    // Route matching
    for (const r of routes) {
      if (r.method !== request.method) continue;
      const match = url.pathname.match(r.pattern);
      if (match?.groups) {
        // Rate limit
        if (!rateLimit(`${ip}:${r.bucket}`, RATE_LIMITS[r.bucket])) {
          return json({ error: "rate_limited" }, 429, cors);
        }
        try {
          const response = await r.handler(request, env, match.groups);
          // Add CORS to all responses
          const newHeaders = new Headers(response.headers);
          Object.entries(cors).forEach(([k, v]) => newHeaders.set(k, v as string));
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        } catch (err) {
          console.error("Worker error:", err);
          return json({ error: "internal_error" }, 500, cors);
        }
      }
    }

    return json({ error: "not_found" }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
