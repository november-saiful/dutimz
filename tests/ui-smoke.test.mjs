// Smoke tests for the DUTIMZ paper edition.
//
// The paper branch is a newspaper: it renders the front page, articles, sections,
// search, corrections and the editorial pages from the public archive, and it has
// no reader accounts, no dashboard, no forum and no submission flow. These tests
// pin the two things that are easy to regress: the reading surface keeps its
// guarantees (redirects, headers, canonicals, justified body copy), and none of
// the retired user-facing product comes back.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = async (path) => {
  await access(new URL(`../${path}`, import.meta.url));
  return true;
};

const READING_ROUTES = [
  'app/layout.tsx',
  'app/page.tsx',
  'app/not-found.tsx',
  'app/news/[slug]/page.tsx',
  'app/category/[slug]/page.tsx',
  'app/search/page.tsx',
  'app/corrections/page.tsx',
  'app/about/page.tsx',
  'app/guidelines/page.tsx',
  'app/api/search/route.ts',
  'app/api/config/route.ts',
  'app/sitemap.ts',
  'app/robots.ts',
];

const RETIRED_ROUTES = [
  'app/account/page.tsx',
  'app/account/write/page.tsx',
  'app/account/balance/page.tsx',
  'app/account/moderation/page.tsx',
  'app/account/admin/page.tsx',
  'app/saved/page.tsx',
  'app/spotlight/page.tsx',
  'app/spotlight/[id]/page.tsx',
  'app/statistics/page.tsx',
  'app/auth/callback/route.ts',
  'app/u/[username]/page.tsx',
  'app/demo/tree-view/page.tsx',
];

test('the legacy redirects file contains only supported path redirects', async () => {
  const redirects = await readProjectFile('public/_redirects');
  assert.doesNotMatch(redirects, /^https?:\/\//m, 'host redirects belong in middleware, not _redirects');
});

test('middleware redirects www to the apex', async () => {
  const middleware = await readProjectFile('middleware.ts');
  assert.match(middleware, /www\.dutimz\.com/);
  assert.match(middleware, /dutimz\.com/);
  assert.match(middleware, /301/);
});

test('worker-rendered responses carry the headers _headers only applies to assets', async () => {
  // The assets layer applies public/_headers to static files. HTML rendered by the Worker
  // never passes through it, so dropping these from middleware silently removes clickjacking
  // and MIME-sniffing protection from every article and section.
  const headers = await readProjectFile('public/_headers');
  const middleware = await readProjectFile('middleware.ts');
  for (const name of [
    'X-Content-Type-Options',
    'Referrer-Policy',
    'X-Frame-Options',
    'Permissions-Policy',
  ]) {
    assert.ok(headers.includes(name), `public/_headers must declare ${name}`);
    assert.ok(middleware.includes(name), `middleware must set ${name} for Worker-rendered pages`);
  }
});

test('news body copy is justified by default', async () => {
  const css = await readProjectFile('app/globals.css');
  // Tailwind 4 declares the rule as a `@utility` (`.article-body` in the old CSS-variable setup).
  assert.match(
    css,
    /(?:@utility\s+article-body|\.article-body)\s*\{[^}]*text-align:\s*justify/,
    'the article body must be justified',
  );
  const article = await readProjectFile('app/news/[slug]/page.tsx');
  assert.match(article, /article-body/);
});

test('the trailing-slash shape agrees between the redirects file and next.config', async () => {
  // public/_redirects normalises to trailing-slash URLs, which is also every page's canonical
  // form. With Next left on its default the framework answered the slashed URL with a 308 back
  // to the unslashed one while the redirects file answered that with a 301, so every article
  // and section URL looped forever. The two must agree.
  const config = await readProjectFile('next.config.ts');
  assert.match(config, /trailingSlash:\s*true/, 'next.config must normalise to the trailing-slash canonicals');

  const redirects = await readProjectFile('public/_redirects');
  const rules = redirects
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  assert.ok(rules.length > 0, 'the redirects file must still declare its path redirects');
  for (const rule of rules) {
    const [from, to, code] = rule.split(/\s+/);
    assert.ok(to?.endsWith('/'), `_redirects must send ${from} to the trailing-slash form`);
    assert.match(code ?? '', /^30[18]$/, `${from} must be a permanent redirect`);
  }
});

test('every reading route exists in the App Router', async () => {
  for (const route of READING_ROUTES) {
    assert.ok(await exists(route), `${route} must exist`);
  }
});

test('the retired account, forum and submission routes are gone', async () => {
  for (const route of RETIRED_ROUTES) {
    await assert.rejects(() => exists(route), `${route} must be removed from the paper edition`);
  }
  for (const component of [
    'components/account',
    'components/auth',
    'components/forum',
    'components/profile',
    'components/statistics',
    'components/ui/user-dropdown.tsx',
    'components/dashboard/throughput-chart.tsx',
    'components/article/comments.tsx',
    'components/article/article-actions.tsx',
    'lib/account-menu.ts',
    'lib/auth-client.ts',
    'lib/use-saved-stories.ts',
  ]) {
    await assert.rejects(() => exists(component), `${component} must be removed from the paper edition`);
  }
});

test('robots and the sitemap are generated from the same site URL', async () => {
  assert.ok(await exists('app/robots.ts'), 'app/robots.ts must generate robots.txt');
  assert.ok(await exists('app/sitemap.ts'), 'app/sitemap.ts must generate the advertised sitemap');
  await assert.rejects(
    () => exists('public/robots.txt'),
    'a static public/robots.txt would shadow the generated one',
  );

  const robots = await readProjectFile('app/robots.ts');
  assert.match(
    robots,
    /sitemap: `\$\{SITE_URL\}\/sitemap\.xml`/,
    'robots.txt must advertise the path Next serves for app/sitemap.ts',
  );
  assert.ok(robots.includes('"/api/"'), 'robots.txt must disallow /api/');
});

test('the sitemap lists canonical, reader-visible URLs only', async () => {
  const sitemap = await readProjectFile('app/sitemap.ts');
  const code = sitemap.replace(/\/\/[^\n]*/g, '');
  assert.match(sitemap, /force-dynamic/, 'a sitemap frozen at deploy time lists only what existed then');
  assert.match(code, /\/news\/\$\{article\.slug\}\//);
  assert.match(code, /\/category\/\$\{slug\}\//);
  for (const forbidden of ['/account', '/auth', '/api', '/saved', '/spotlight', '/statistics']) {
    assert.ok(!code.includes(forbidden), `the sitemap must not advertise ${forbidden}`);
  }
  const stories = await readProjectFile('lib/stories.ts');
  assert.match(stories, /getSitemapArticles/);
  assert.match(stories, /getSitemapCategorySlugs/);
});

test('the config endpoint keeps the public shape and never leaks secrets', async () => {
  const route = await readProjectFile('app/api/config/route.ts');
  for (const key of ['supabaseUrl', 'supabaseAnonKey', 'mediaUrl', 'demoMode']) {
    assert.ok(route.includes(key), `config endpoint must expose ${key}`);
  }
  assert.doesNotMatch(route, /service_role|SERVICE_ROLE|secret/i);
  assert.match(route, /no-store/);
});

test('the rail carries sections and editorial pages, never the account surfaces', async () => {
  const sidebar = await readProjectFile('components/dashboard/dutimz-sidebar.tsx');
  assert.match(sidebar, /collapsible="offcanvas"/);
  for (const label of ['সব খবর', 'খুঁজুন', 'আমাদের পরিচয়', 'নীতিমালা', 'সংশোধন']) {
    assert.ok(sidebar.includes(label), `the rail must link ${label}`);
  }
  for (const retired of ['পরিসংখ্যান', 'সংরক্ষিত', 'আমার ড্যাশবোর্ড', 'প্রতিবেদন লিখুন', 'স্পটলাইট']) {
    assert.ok(!sidebar.includes(retired), `the rail must not link ${retired}`);
  }
  const site = await readProjectFile('lib/site.ts');
  for (const slug of ['campus', 'university', 'student-life', 'culture', 'opinion', 'sports']) {
    assert.ok(sidebar.includes(slug) || site.includes(slug), `the sections must include ${slug}`);
  }
});

test('the header keeps the search palette and has no account menu', async () => {
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /CommandPalette/);
  assert.match(header, /SidebarTrigger/);
  assert.match(header, /md:hidden/, 'the desktop rail has no minimize trigger');
  assert.match(header, /ব্রেকিং/);
  assert.doesNotMatch(header, /UserDropdown/, 'the account menu is gone');
  assert.doesNotMatch(header, /supabase/i, 'the header holds no Supabase client');
  assert.doesNotMatch(header, /onAuthStateChange/, 'the header keeps no session');
  assert.doesNotMatch(header, /signInWithGoogle/, 'there is no sign-in flow to start');
});

test('the wordmark is centred in the top bar and gone from the rail', async () => {
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /dutimz-text-logo\.svg/);
  assert.match(header, /grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  const sidebar = await readProjectFile('components/dashboard/dutimz-sidebar.tsx');
  assert.doesNotMatch(sidebar, /dutimz-text-logo\.svg/);
  assert.doesNotMatch(sidebar, /brand-icon\.svg/, 'the rail carries no branding');
});

test('the header search is a command palette over the archive', async () => {
  const palette = await readProjectFile('components/dashboard/command-palette.tsx');
  assert.match(palette, /metaKey/);
  assert.match(palette, /ctrlKey/);
  assert.match(palette, /\/api\/search/);
  assert.match(palette, /CATEGORIES/);
  assert.doesNotMatch(palette, /supabase/i, 'archive reads belong to the endpoint');
  for (const retired of ['/account', '/saved', '/spotlight', '/statistics']) {
    assert.ok(!palette.includes(retired), `the palette must not offer ${retired}`);
  }
  const route = await readProjectFile('app/api/search/route.ts');
  assert.match(route, /search_public_articles/);
  assert.match(route, /isDemoMode/);
  assert.match(route, /no-store/);
  assert.doesNotMatch(route, /service_role|SERVICE_ROLE|secret/i);
});

test('the front page is the paper, with no reader routes in it', async () => {
  const page = await readProjectFile('app/page.tsx');
  assert.match(page, /DutimzShell/);
  assert.match(page, /PaperWordmark/);
  assert.match(page, /ShareStory/);
  assert.match(page, /breaking|প্রধান প্রতিবেদন|সর্বশেষ প্রতিবেদন/);
  assert.doesNotMatch(page, /\/account/, 'the front page must not link the account area');
  assert.doesNotMatch(page, /\/spotlight/, 'the front page must not link the forum');
  assert.ok(await exists('components/dashboard/paper-wordmark.tsx'));
  assert.ok(await exists('components/dashboard/share-story.tsx'));
});

test('the article page reads the story and nothing about the reader', async () => {
  const article = await readProjectFile('app/news/[slug]/page.tsx');
  assert.match(article, /article-body/);
  assert.match(article, /NewsArticle/, 'the article keeps its structured data');
  assert.match(article, /ArticleGallery/);
  assert.doesNotMatch(article, /Comments|ArticleActions|PendingArticle/, 'reader interaction is gone');
  assert.doesNotMatch(article, /supabaseBrowser/, 'the article page holds no browser session');
});

test('the phone dock carries the newspaper sections, not the account', async () => {
  const dock = await readProjectFile('components/dashboard/mobile-bottom-nav.tsx');
  for (const label of ['হোম', 'খুঁজুন', 'মেনু', 'সংশোধন', 'পরিচয়']) {
    assert.ok(dock.includes(label), `the dock must label ${label}`);
  }
  assert.match(dock, /md:hidden/, 'the dock is phone-only');
  assert.match(dock, /QUICK_ACTIONS/);
  assert.match(dock, /aria-expanded/, 'the centre toggle is a disclosure');
  for (const retired of ['/account', '/saved', '/spotlight', '/statistics']) {
    assert.ok(!dock.includes(`${retired}`), `the dock must not link ${retired}`);
  }
  const shell = await readProjectFile('components/dashboard/dutimz-shell.tsx');
  assert.match(shell, /MobileBottomNav/);
});

test('one Supabase client module owns every Supabase import', async () => {
  const walk = (url) =>
    readdirSync(url, { withFileTypes: true }).flatMap((entry) => {
      const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
      return entry.isDirectory() ? walk(child) : [child];
    });
  const sources = ['../app/', '../components/', '../lib/'].flatMap((root) =>
    walk(new URL(root, import.meta.url)),
  );
  const offenders = [];
  for (const file of sources) {
    if (!/\.(ts|tsx)$/.test(file.pathname)) continue;
    const rel = fileURLToPath(file).replace(/\\/g, '/');
    if (rel.endsWith('/lib/supabase.ts')) continue;
    const text = await readFile(file, 'utf8');
    if (/@supabase\//.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], 'only lib/supabase.ts may import the Supabase SDKs');
});

test('the shared shell and search primitives exist', async () => {
  for (const primitive of ['sidebar', 'command', 'card', 'badge', 'button', 'sheet', 'toast']) {
    assert.ok(await exists(`components/ui/${primitive}.tsx`), `components/ui/${primitive}.tsx must exist`);
  }
});
