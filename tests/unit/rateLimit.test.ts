import { beforeEach, describe, expect, it } from "vitest";
import {
  RATE_LIMITS,
  checkRateLimit,
  clientIp,
  rateLimitHeaders,
  rateLimitKey,
  resetRateLimits,
} from "@/lib/api/rateLimit";

const rule = { requests: 3, windowSeconds: 60 };

beforeEach(() => {
  resetRateLimits();
});

describe("checkRateLimit", () => {
  it("allows exactly `requests` hits per window and then blocks", () => {
    const start = 1_000_000;
    const results = [0, 1, 2, 3].map((i) =>
      checkRateLimit("k", rule, start + i),
    );

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3]?.limit).toBe(3);
  });

  it("reports how long to wait when blocked", () => {
    const start = 1_000_000;
    for (let i = 0; i < 4; i += 1) checkRateLimit("k", rule, start);

    // 20s into a 60s window leaves 40s.
    const blocked = checkRateLimit("k", rule, start + 20_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(40);
  });

  it("starts a fresh window once the old one expires", () => {
    const start = 1_000_000;
    for (let i = 0; i < 4; i += 1) checkRateLimit("k", rule, start);

    const afterWindow = checkRateLimit("k", rule, start + 60_001);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(2);
  });

  it("keeps identities independent", () => {
    const start = 1_000_000;
    for (let i = 0; i < 4; i += 1) checkRateLimit("comment:1.1.1.1", rule, start);

    expect(checkRateLimit("comment:2.2.2.2", rule, start).allowed).toBe(true);
    expect(checkRateLimit("poll:1.1.1.1", rule, start).allowed).toBe(true);
  });

  it("does not let a burst straddling a window exceed the budget unnoticed", () => {
    const start = 1_000_000;
    for (let i = 0; i < 3; i += 1) checkRateLimit("k", rule, start + i);
    for (let i = 0; i < 3; i += 1) checkRateLimit("k", rule, start + 60_000 + i);

    // Fixed windows allow up to 2x across the boundary — documented, not a bug.
    expect(checkRateLimit("k", rule, start + 60_000 + 3).allowed).toBe(false);
  });
});

describe("RATE_LIMITS", () => {
  it("matches the budgets in the build spec", () => {
    expect(RATE_LIMITS.public.requests).toBe(100);
    expect(RATE_LIMITS.comment.requests).toBe(30);
    expect(RATE_LIMITS.upload.requests).toBe(5);
    expect(RATE_LIMITS.search.requests).toBe(60);
  });
});

describe("clientIp", () => {
  it("prefers the Cloudflare-set header", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.9",
      "x-forwarded-for": "10.0.0.1, 10.0.0.2",
    });
    expect(clientIp(headers)).toBe("203.0.113.9");
  });

  it("uses the first x-forwarded-for hop", () => {
    const headers = new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" });
    expect(clientIp(headers)).toBe("198.51.100.4");
  });

  it("falls back to x-real-ip, then to a shared bucket", () => {
    expect(clientIp(new Headers({ "x-real-ip": "192.0.2.7" }))).toBe("192.0.2.7");
    expect(clientIp(new Headers())).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": "  " }))).toBe("unknown");
  });
});

describe("rateLimitHeaders", () => {
  it("advertises the budget without leaking the key", () => {
    const result = checkRateLimit(rateLimitKey("search", "1.2.3.4"), RATE_LIMITS.search, 0);
    expect(rateLimitHeaders(result)).toEqual({
      "x-ratelimit-limit": "60",
      "x-ratelimit-remaining": "59",
    });
  });
});
