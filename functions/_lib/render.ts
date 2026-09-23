export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export function publicName(profile: { display_name?: string; username?: string } | null | undefined) {
  return profile?.display_name?.trim() || `@${profile?.username || 'পাঠক'}`;
}

export function pageShell(title: string, description: string, canonical: string, content: string): string {
  const siteTitle = `${escapeHtml(title)} | ডুটিমজ`;
  const safeDescription = escapeHtml(description);
  const safeCanonical = escapeHtml(canonical);
  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#edf1fc"><meta name="color-scheme" content="light"><meta name="description" content="${safeDescription}"><link rel="canonical" href="${safeCanonical}"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/site.css"><meta property="og:site_name" content="ডুটিমজ"><meta property="og:locale" content="bn_BD"><meta property="og:type" content="article"><meta property="og:title" content="${siteTitle}"><meta property="og:description" content="${safeDescription}"><meta property="og:url" content="${safeCanonical}"><title>${siteTitle}</title></head>
<body><a class="skip-link" href="#main-content">মূল লেখায় যান</a><div class="page-backdrop" aria-hidden="true"></div><header class="site-header"><div class="masthead"><a class="brand" href="/" aria-label="ডুটিমজ মূলপাতা"><span class="brand-mark" aria-hidden="true">ঢা</span><span class="brand-copy"><strong>ডুটিমজ</strong><span>ঢাকা বিশ্ববিদ্যালয়ের সংবাদমাধ্যম</span></span></a><div class="masthead-right"><form class="header-search" action="/search/" role="search"><label class="sr-only" for="server-search">খবর খুঁজুন</label><input id="server-search" name="q" type="search" placeholder="খবর, বিষয় বা বিভাগ খুঁজুন…"><button type="submit" aria-label="খুঁজুন">⌕</button></form><a class="account-button" href="/auth/sign-in/"><span class="account-avatar" aria-hidden="true">ঢা</span><span class="account-button-label">অ্যাকাউন্ট</span></a></div></div><nav class="mobile-categories" aria-label="সংবাদ বিভাগ"><a class="category-chip" href="/">সব খবর</a><a class="category-chip" href="/category/campus/">ক্যাম্পাস</a><a class="category-chip" href="/category/university/">বিশ্ববিদ্যালয়</a><a class="category-chip" href="/category/student-life/">শিক্ষার্থী জীবন</a><a class="category-chip" href="/category/culture/">সংস্কৃতি</a></nav></header><main id="main-content" class="site-main">${content}</main><footer class="site-footer"><a class="footer-brand" href="/"><span class="brand-mark brand-mark--small" aria-hidden="true">ঢা</span><span>ডুটিমজ</span></a><p>ঢাকা বিশ্ববিদ্যালয়ের কণ্ঠস্বর</p><nav class="footer-links"><a href="/about/">আমাদের পরিচয়</a><a href="/guidelines/">সম্পাদকীয় নীতিমালা</a><a href="mailto:hello@dutimz.com">যোগাযোগ</a></nav><span class="footer-copy">© ${new Date().getFullYear()} ডুটিমজ</span></footer><nav class="mobile-dock" aria-label="দ্রুত নেভিগেশন"><a href="/" class="mobile-dock__link"><span aria-hidden="true">⌂</span><span>মূলপাতা</span></a><a href="/search/" class="mobile-dock__link"><span aria-hidden="true">⌕</span><span>খুঁজুন</span></a><a href="/saved/" class="mobile-dock__link"><span aria-hidden="true">▱</span><span>সংরক্ষিত</span></a><a href="/auth/sign-in/" class="mobile-dock__link"><span aria-hidden="true">ঢা</span><span>অ্যাকাউন্ট</span></a></nav><script type="module" src="/client.js"></script></body></html>`;
}

export function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function responseHtml(html: string, status = 200, cache = 'public, max-age=30, stale-while-revalidate=120') {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
  });
}
