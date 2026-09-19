/**
 * Best-effort rate limiting for the public API routes.
 *
 * Deliberately dependency-free and in-memory: like the Cloudflare Worker's
 * limiter, each serverless/edge instance counts independently, so this raises
 * the cost of abuse (and stops runaway clients) rather than providing a hard
 * global guarantee. A shared store (Upstash/Redis or Durable Objects) would be
 * needed for that — see README "Rate limiting".
 *
 * Budgets come from the build spec (§9.4):
 *   public 100/min · comment 30/min · upload 5/min · search 60/min
 * plus budgets for the Phase 4/5 writes that postdate the spec table.
 *
 * The window is fixed rather than sliding: simple and cheap, at the cost of
 * allowing up to 2× the limit across a window boundary.
 */

export interface RateLimitRule {
  /** Allowed requests per window. */
  requests: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  /**
   * Spec §9.4. Defined but not applied to any route yet: it is the general
   * bucket for unsigned traffic, and the cheap read routes (comment lists,
   * article JSON) are deliberately left uncounted because readers behind one
   * office NAT would share it.
   */
  public: { requests: 100, windowSeconds: 60 },
  /** Spec §9.4 */
  comment: { requests: 30, windowSeconds: 60 },
  upload: { requests: 5, windowSeconds: 60 },
  search: { requests: 60, windowSeconds: 60 },
  /** Writes introduced after the spec table; sized like their cousins. */
  reaction: { requests: 30, windowSeconds: 60 },
  bookmark: { requests: 30, windowSeconds: 60 },
  poll: { requests: 10, windowSeconds: 60 },
  newsletter: { requests: 5, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets (what `Retry-After` should say). */
  retryAfterSeconds: number;
}

interface Counter {
  count: number;
  resetAt: number;
}

const counters = new Map<string, Counter>();
/** Sweep at most once per minute so long-lived instances cannot grow forever. */
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, counter] of counters) {
    if (counter.resetAt <= now) counters.delete(key);
  }
}

/**
 * Count one hit for `key` under `rule` and report whether it is allowed.
 * `now` is injectable so tests do not have to sleep.
 */
export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitResult {
  sweep(now);

  const windowMs = rule.windowSeconds * 1000;
  const existing = counters.get(key);

  if (!existing || existing.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      limit: rule.requests,
      remaining: rule.requests - 1,
      retryAfterSeconds: rule.windowSeconds,
    };
  }

  existing.count += 1;
  const remaining = Math.max(0, rule.requests - existing.count);
  return {
    allowed: existing.count <= rule.requests,
    limit: rule.requests,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/** Reset all counters — used by tests. */
export function resetRateLimits(): void {
  counters.clear();
  lastSweep = 0;
}

/**
 * Caller identity for the limiter.
 *
 * Prefers the Cloudflare-set header (unspoofable in production); falls back to
 * the first `x-forwarded-for` hop, then `x-real-ip`. Falls back to a constant
 * when nothing is present so a missing header cannot bypass the limiter
 * entirely — it just shares one bucket.
 */
export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const real = headers.get("x-real-ip");
  if (real?.trim()) return real.trim();

  return "unknown";
}

/** Compose the counter key, e.g. `comment:1.2.3.4`. */
export function rateLimitKey(bucket: RateLimitBucket, identity: string): string {
  return `${bucket}:${identity}`;
}

/** Headers advertising the caller's remaining budget. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
  };
}
