/**
 * DUTIMZ Cloudflare Worker — Edge API (section 9)
 * Public read endpoints + rate limiting. Protected routes land in later phases.
 */

/// <reference types="@cloudflare/workers-types" />

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

interface Route {
  method: string;
  pattern: RegExp;
  bucket: "public" | "search";
  handler: (
    request: Request,
    env: Env,
    params: Record<string, string>,
  ) => Promise<Response>;
}

const RATE_LIMITS = {
  public: { requests: 100, window: 60 },
  search: { requests: 60, window: 60 },
} as const;

// Best-effort per-IP limiter (per-isolate in Phase 1; Durable Objects later).
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

function route(
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
      "cache-control": "public, max-age=60, s-maxage=300",
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
  };
}

// ---------- handlers ----------

route(
  "GET",
  "/api/contents",
  "public",
  async (request, env) => {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 50);
    let rest =
      `${env.SUPABASE_URL}/rest/v1/contents?select=*` +
      `&status=eq.published&published_at=lte.${new Date().toISOString()}` +
      `&order=published_at.desc&limit=${limit}`;
    const category = url.searchParams.get("category");
    if (category) rest += `&category_id=eq.${encodeURIComponent(category)}`;
    const type = url.searchParams.get("type");
    if (type) rest += `&content_type=eq.${encodeURIComponent(type)}`;

    const res = await fetch(rest, { headers: supabaseHeaders(env) });
    const data = await res.json();
    return json({ data }, res.ok ? 200 : 502);
  },
);

route(
  "GET",
  "/api/contents/:id",
  "public",
  async (_request, env, params) => {
    const rest =
      `${env.SUPABASE_URL}/rest/v1/contents?select=*` +
      `&id=eq.${encodeURIComponent(params.id ?? "")}` +
      `&status=eq.published&limit=1`;
    const res = await fetch(rest, { headers: supabaseHeaders(env) });
    const data = (await res.json()) as unknown[];
    if (!Array.isArray(data) || data.length === 0) {
      return json({ error: "not_found" }, 404);
    }
    return json({ data: data[0] });
  },
);

route("GET", "/api/categories", "public", async (_request, env) => {
  const rest =
    `${env.SUPABASE_URL}/rest/v1/categories?select=*` +
    `&is_active=eq.true&order=sort_order.asc`;
  const res = await fetch(rest, { headers: supabaseHeaders(env) });
  return json(await res.json(), res.ok ? 200 : 502);
});

route("GET", "/api/search", "search", async (request, env) => {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return json({ error: "invalid_query" }, 400);

  // Uses a Postgres function created in a later migration (Phase 4 search).
  const rest = `${env.SUPABASE_URL}/rest/v1/rpc/search_contents?q=${encodeURIComponent(q)}`;
  const res = await fetch(rest, { headers: supabaseHeaders(env) });
  return json(await res.json(), res.ok ? 200 : 502);
});

// ---------- entrypoint ----------

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get("origin"));

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const bucketKey = url.pathname === "/api/search" ? "search" : "public";
    if (!rateLimit(`${ip}:${bucketKey}`, RATE_LIMITS[bucketKey])) {
      return json({ error: "rate_limited" }, 429, cors);
    }

    for (const r of routes) {
      if (r.method !== request.method) continue;
      const match = url.pathname.match(r.pattern);
      if (match?.groups) {
        try {
          return await r.handler(request, env, match.groups);
        } catch {
          return json({ error: "internal_error" }, 500, cors);
        }
      }
    }

    return json({ error: "not_found" }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
