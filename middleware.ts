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
