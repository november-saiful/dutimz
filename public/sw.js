/**
 * Phase 5 Service Worker — provides offline support for DUTIMZ.
 * Strategy: cache-first for static assets, network-first for pages
 * with offline fallback. Bilingual news portal needs to work on
 * unreliable connections common in Bangladesh.
 */
const CACHE_NAME = "dutimz-v1";
const STATIC_CACHE = "dutimz-static-v1";
const PAGE_CACHE = "dutimz-pages-v1";

const STATIC_ASSETS = [
  "/",
  "/favicon.svg",
  "/dutimz-logo.svg",
  "/manifest.json",
];

// Install: precache shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// Fetch: network-first for pages, cache-first for static
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, API routes, and Next.js internal
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/auth/")
  ) {
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Pages: network-first with offline fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then(
          (cached) =>
            cached ||
            new Response(
              `<!DOCTYPE html>
<html lang="bn">
<head><meta charset="utf-8"><title>DUTIMZ — অফলাইন</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem">
  <div>
    <h1 style="font-size:1.5rem;margin-bottom:1rem">📭 অফলাইন</h1>
    <p style="opacity:0.6">ইন্টারনেট সংযোগ নেই। পরে আবার চেষ্টা করুন।</p>
    <p style="opacity:0.6;font-size:0.8rem;margin-top:0.5rem">No internet connection. Please try again later.</p>
    <button onclick="location.reload()" style="margin-top:1rem;padding:0.5rem 1.5rem;border:none;border-radius:9999px;background:#1a73e8;color:white;cursor:pointer">
      পুনরায় চেষ্টা করুন / Retry
    </button>
  </div>
</body>
</html>`,
              {
                headers: { "Content-Type": "text/html; charset=utf-8" },
                status: 200,
              },
            ),
        );
      }),
  );
});
