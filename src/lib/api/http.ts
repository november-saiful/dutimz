/**
 * Shared HTTP behaviour for the public API routes: rate-limited responses and
 * the error body for a failed schema validation.
 *
 * Split from `rateLimit.ts` (pure) and `validation.ts` (pure) so those can be
 * unit-tested without pulling in `next/server`, and so the "how do we answer a
 * throttled caller" decision lives in exactly one place.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  RATE_LIMITS,
  checkRateLimit,
  clientIp,
  rateLimitHeaders,
  rateLimitKey,
  type RateLimitBucket,
} from "@/lib/api/rateLimit";
import type { FieldIssue } from "@/lib/api/validation";

/**
 * Count this request against `bucket` and return a `429` when the caller is
 * over budget, or `null` when the request may proceed.
 *
 * Callers are identified by IP: these endpoints are reachable signed-out, and
 * a user id would not cover anonymous callers. That also means everyone behind
 * one NAT shares a bucket, which is why the budgets are generous relative to
 * real usage.
 */
export function enforceRateLimit(
  request: NextRequest,
  bucket: RateLimitBucket,
): NextResponse | null {
  const result = checkRateLimit(
    rateLimitKey(bucket, clientIp(request.headers)),
    RATE_LIMITS[bucket],
  );
  if (result.allowed) return null;

  return NextResponse.json(
    {
      error: "Too many requests. Please try again shortly.",
      retryAfter: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        ...rateLimitHeaders(result),
        "retry-after": String(result.retryAfterSeconds),
      },
    },
  );
}

/** The `400`/`413` body for a payload that failed its schema. */
export function validationFailure(failure: {
  status: number;
  error: string;
  issues: FieldIssue[];
}): NextResponse {
  return NextResponse.json(
    { error: failure.error, issues: failure.issues },
    { status: failure.status },
  );
}
