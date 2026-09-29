// Smoke tests for the Next.js App Router portal.
//
// The previous Astro suite asserted Astro sources (BaseLayout, client.ts,
// site.css, dist/*.html). Those files are gone; the guarantees move here:
// every route file exists, the www redirect lives in middleware, the public
// config endpoint keeps its shape, and the anonymity byline helper never
// hands an anonymous story a profile link.
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = async (path) => {
  await access(new URL(`../${path}`, import.meta.url));
  return true;
};

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

test('every portal route exists in the App Router', async () => {
  for (const route of [
    'app/page.tsx',
    'app/layout.tsx',
    'app/not-found.tsx',
    'app/news/[slug]/page.tsx',
    'app/category/[slug]/page.tsx',
    'app/search/page.tsx',
    'app/statistics/page.tsx',
    'app/corrections/page.tsx',
    'app/about/page.tsx',
    'app/guidelines/page.tsx',
    'app/saved/page.tsx',
    'app/auth/sign-in/page.tsx',
    'app/auth/callback/route.ts',
    'app/api/config/route.ts',
    'app/account/page.tsx',
    'app/account/write/page.tsx',
    'app/account/balance/page.tsx',
    'app/account/moderation/page.tsx',
    'app/account/admin/page.tsx',
    'app/u/[username]/page.tsx',
    'app/profile/me/page.tsx',
  ]) {
    assert.ok(await exists(route), `${route} must exist`);
  }
  void projectRoot;
});

test('the config endpoint keeps the public shape and never leaks secrets', async () => {
  const route = await readProjectFile('app/api/config/route.ts');
  for (const key of ['supabaseUrl', 'supabaseAnonKey', 'mediaUrl', 'demoMode']) {
    assert.ok(route.includes(key), `config endpoint must expose ${key}`);
  }
  assert.doesNotMatch(route, /service_role|SERVICE_ROLE|secret/i);
  assert.match(route, /no-store/);
});

test('the dashboard shell wraps every page with the DUTIMZ sidebar', async () => {
  const shell = await readProjectFile('components/dashboard/dutimz-shell.tsx');
  assert.match(shell, /SidebarProvider/);
  assert.match(shell, /DutimzSidebar/);
  assert.match(shell, /SidebarInset/);
  const sidebar = await readProjectFile('components/dashboard/dutimz-sidebar.tsx');
  for (const label of ['সব খবর', 'পরিসংখ্যান', 'সংরক্ষিত', 'আমার ড্যাশবোর্ড', 'প্রতিবেদন লিখুন']) {
    assert.ok(sidebar.includes(label), `sidebar must link ${label}`);
  }
  for (const slug of ['campus', 'university', 'student-life', 'culture', 'opinion', 'sports']) {
    assert.ok(sidebar.includes(slug) || (await readProjectFile('lib/site.ts')).includes(slug), `sidebar categories must include ${slug}`);
  }
});

test('anonymous stories never receive a profile link', async () => {
  const supabase = await readProjectFile('lib/supabase.ts');
  assert.match(supabase, /ANONYMOUS_BYLINE/);
  assert.match(supabase, /is_anonymous/);
  const article = await readProjectFile('app/news/[slug]/page.tsx');
  assert.match(article, /ANONYMOUS_BYLINE/);
  // The credited branch renders a link; the anonymous branch renders <strong>.
  assert.match(article, /credit\.href \? \(/);
  const card = await readProjectFile('components/dashboard/story-card.tsx');
  assert.match(card, /credit\.href \? \(/);
});

test('articles are submitted through the audited RPC, never a direct insert', async () => {
  const writer = await readProjectFile('components/account/writer-form.tsx');
  assert.match(writer, /rpc\(['"]submit_article['"]/);
  assert.match(writer, /p_is_anonymous/);
  assert.doesNotMatch(writer, /\.from\(['"]articles['"]\)\.insert/);
});

test('article reader keeps reactions, bookmarks, share, corrections, and comments', async () => {
  const actions = await readProjectFile('components/article/article-actions.tsx');
  assert.match(actions, /get_article_stats/);
  assert.match(actions, /from\(['"]reactions['"]\)/);
  assert.match(actions, /from\(['"]bookmarks['"]\)/);
  assert.match(actions, /corrections@dutimz\.com/);
  const comments = await readProjectFile('components/article/comments.tsx');
  assert.match(comments, /from\(['"]comments['"]\)/);
  assert.match(comments, /status.*visible|eq\(['"]status['"], ['"]visible['"]\)/);
});

test('the article page keeps NewsArticle structured data with gallery images', async () => {
  const article = await readProjectFile('app/news/[slug]/page.tsx');
  assert.match(article, /NewsArticle/);
  assert.match(article, /datePublished/);
  assert.match(article, /article_media|gallery/);
});

test('statistics expose only aggregate counts, never identities', async () => {
  const stats = await readProjectFile('components/statistics/public-stats.tsx');
  assert.match(stats, /get_public_article_questionnaire_stats/);
  assert.doesNotMatch(stats, /username|display_name|avatar/);
  const corrections = await readProjectFile('components/corrections/corrections-list.tsx');
  assert.match(corrections, /list_corrections/);
});

test('shadcn primitives required by the dashboard shell exist', async () => {
  for (const primitive of ['avatar', 'badge', 'button', 'card', 'chart', 'input', 'separator', 'skeleton', 'tooltip', 'sheet', 'label', 'progress', 'sidebar']) {
    assert.ok(await exists(`components/ui/${primitive}.tsx`), `components/ui/${primitive}.tsx must exist`);
  }
});
