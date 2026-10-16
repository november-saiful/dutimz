import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The same guarantees public/_headers declares for `/*`.
//
// That file is applied by Cloudflare's assets layer, and only to the static files it serves:
// responses the Worker renders itself — the home page, articles, sections, search, the
// account pages — leave that layer untouched and would otherwise ship with none of these
// headers. Assets keep getting them from public/_headers; everything else gets them here.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function harden(response: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export function middleware(request: NextRequest) {
  // The incremental-cache queue regenerates a stale page by calling the Worker back through
  // WORKER_SELF_REFERENCE with the *original* request's host — including www — as an internal
  // HEAD carrying `x-isr` / `x-prerender-revalidate`. Redirecting that call away makes the
  // revalidation fail, and the queue keys the failure without the host, so a single www visit
  // suppresses the apex revalidation of the same entry too: the page then serves STALE forever
  // (s-maxage=2 on every load) and only a deploy refreshes it. The internal call is let through;
  // a forged header merely skips one redirect to the same content, so there is nothing to gain.
  if (request.headers.has("x-isr") || request.headers.has("x-prerender-revalidate")) {
    return harden(NextResponse.next());
  }
  const hostname = request.headers.get("host")?.toLowerCase() ?? "";
  if (hostname === "www.dutimz.com") {
    const url = request.nextUrl.clone();
    url.hostname = "dutimz.com";
    url.protocol = "https:";
    return harden(NextResponse.redirect(url, 301));
  }
  return harden(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
