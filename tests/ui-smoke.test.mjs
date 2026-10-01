// Smoke tests for the Next.js App Router portal.
//
// The previous Astro suite asserted Astro sources (BaseLayout, client.ts,
// site.css, dist/*.html). Those files are gone; the guarantees move here:
// every route file exists, the www redirect lives in middleware, the public
// config endpoint keeps its shape, and the anonymity byline helper never
// hands an anonymous story a profile link.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { access } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const componentsDir = fileURLToPath(new URL('../components', import.meta.url));
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

test('worker-rendered responses carry the headers _headers only applies to assets', async () => {
  // The assets layer applies public/_headers to static files. HTML rendered by the Worker
  // never passes through it, so dropping these from middleware silently removes clickjacking
  // and MIME-sniffing protection from every article, section and account page.
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
  // Tailwind 4 declares the rule as a `@utility` (`.article-body` in the old
  // CSS-variable setup), so accept either shape.
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
  // form. With Next left on its default (trailingSlash: false) it answered the slashed URL
  // with a 308 back to the unslashed one while the redirects file answered that with a 301,
  // so every article, section and profile URL looped forever. The two must agree.
  const config = await readProjectFile('next.config.ts');
  assert.match(
    config,
    /trailingSlash:\s*true/,
    'next.config must normalise to the trailing-slash canonicals',
  );

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
    'app/auth/callback/route.ts',
    'app/api/config/route.ts',
    'app/account/page.tsx',
    'app/account/write/page.tsx',
    'app/account/balance/page.tsx',
    'app/account/moderation/page.tsx',
    'app/account/admin/page.tsx',
    'app/u/[username]/page.tsx',
    'app/profile/me/page.tsx',
    'app/sitemap.ts',
    'app/robots.ts',
  ]) {
    assert.ok(await exists(route), `${route} must exist`);
  }
  // There is no dedicated sign-in page: the account menu, and every gated
  // action, start the Google flow directly.
  await assert.rejects(
    () => exists('app/auth/sign-in/page.tsx'),
    'the dedicated sign-in page must be gone',
  );
  void projectRoot;
});

test('robots and the sitemap are generated from the same site URL', async () => {
  // The port deleted Astro's sitemap integration but left public/robots.txt advertising
  // /sitemap-index.xml, so every sitemap path answered 404 while robots.txt kept pointing at
  // it. Generating both from SITE_URL is what keeps the pointer and the file in step.
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
    'robots.txt must advertise the path Next serves for app/sitemap.ts, not the retired Astro one',
  );
  for (const path of ['/account/', '/auth/', '/api/']) {
    assert.ok(robots.includes(`"${path}"`), `robots.txt must disallow ${path}`);
  }
});

test('the sitemap lists canonical, reader-visible URLs only', async () => {
  const sitemap = await readProjectFile('app/sitemap.ts');
  const code = sitemap.replace(/\/\/[^\n]*/g, '');
  assert.match(
    sitemap,
    /force-dynamic/,
    'a sitemap frozen at deploy time lists only what existed then, and crawlers trust it',
  );
  // Every advertised URL must be the trailing-slash canonical the site redirects to, or the
  // crawler is sent through a redirect on each page.
  assert.match(code, /\/news\/\$\{article\.slug\}\//);
  assert.match(code, /\/category\/\$\{slug\}\//);
  for (const forbidden of ['/account', '/auth', '/api', '/saved', '/profile/me']) {
    assert.ok(
      !code.includes(forbidden),
      `the sitemap must not advertise the reader-only ${forbidden}`,
    );
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

test('the desktop sidebar is fixed and expanded; phones keep the drawer', async () => {
  // The rail used to be a minimizable icon rail backed by a cookie. It is now
  // fixed and always expanded on desktop, while the phone drawer still works
  // through the Sidebar's own Sheet.
  const state = await readProjectFile('components/dashboard/sidebar-state.tsx');
  assert.match(state, /SidebarProvider/);
  assert.match(state, /open/);
  assert.doesNotMatch(state, /sidebar_state/);
  assert.doesNotMatch(state, /useState/);
  const sidebar = await readProjectFile('components/dashboard/dutimz-sidebar.tsx');
  assert.match(sidebar, /collapsible="offcanvas"/);
  assert.doesNotMatch(sidebar, /collapsible="none"/);
  const shell = await readProjectFile('components/dashboard/dutimz-shell.tsx');
  assert.match(shell, /SidebarState/);
  assert.doesNotMatch(shell, /<SidebarProvider>/);
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /SidebarTrigger/);
  assert.match(header, /md:hidden/, 'the desktop rail has no minimize trigger');
  const provider = await readProjectFile('components/ui/sidebar.tsx');
  assert.match(provider, /Sheet open=\{openMobile\}/, 'phones must still get the drawer');
  assert.match(
    provider,
    /setOpenMobile\(\(current\) => !current\)/,
    'the toggle must drive the mobile drawer',
  );
});

test('the dashboard shell wraps every page with the DUTIMZ sidebar', async () => {
  const shell = await readProjectFile('components/dashboard/dutimz-shell.tsx');
  assert.match(shell, /SidebarState/);
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

test('the header account menu is the session dropdown with DUTIMZ routes', async () => {
  // The header must never show menu entries that go nowhere: there is no presence
  // system, no theming, and no premium tier, so those actions stay hidden and every
  // visible one maps to a real route.
  const dropdown = await readProjectFile('components/ui/user-dropdown.tsx');
  assert.match(dropdown, /hiddenActions/);
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /UserDropdown/);
  assert.match(header, /supabaseBrowser/);
  assert.match(header, /onAuthStateChange/);
  assert.match(header, /hiddenActions/);
  // Actions and destinations live in one shared table, so the menu and the
  // handler cannot drift apart.
  const table = await readProjectFile('lib/account-menu.ts');
  assert.match(header, /@\/lib\/account-menu/, 'the header must route through the shared table');
  assert.match(dropdown, /@\/lib\/account-menu/, 'the menu must read the shared table');
  for (const route of ['/profile/me/', '/account/', '/saved/', '/about/']) {
    assert.ok(table.includes(`"${route}"`), `the account route table must include ${route}`);
  }
  assert.match(header, /signOut/);
});

test('the account menu is one menu in both states and signs guests in from it', async () => {
  // A visitor with no session is still a reader. The account menu no longer
  // branches into two different shapes: the same groups render for everyone,
  // and the only differences are the Google button (signed out) and the account
  // group (signed in). A signed-out tap on a session-only row starts the OAuth
  // flow instead of navigating somewhere that would bounce them back.
  const dropdown = await readProjectFile('components/ui/user-dropdown.tsx');
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');

  assert.match(dropdown, /isGuest/, 'the dropdown must distinguish a signed-out visitor');
  assert.doesNotMatch(
    dropdown,
    /guestExplore|guestInfo|MENU_ITEMS\.guest/,
    'the two-shape guest menu is gone',
  );
  assert.match(dropdown, /<SignInButton/, 'the Google button lives inside the menu');
  assert.match(dropdown, /isGuest && \(/, 'only the signed-out branch adds it');
  assert.doesNotMatch(dropdown, /href="\/auth\/sign-in"/, 'there is no sign-in page to link to');

  // Session-only rows stay visible in both states; a signed-out tap routes to
  // the header's Google action rather than to the row's own destination.
  assert.match(dropdown, /requiresSession/);
  assert.match(dropdown, /isGuest && item\.requiresSession \? "sign-in" : item\.action/);

  // The header always mounts the menu, passing null when signed out — never a
  // bare avatar that drops the visitor on a page they cannot use.
  assert.match(header, /user=\{menuUser\s*\?\s*\{/);
  assert.match(header, /:\s*null\}/);
  assert.doesNotMatch(header, /<Link href="\/account"/, 'signed-out must not fall back to a bare /account link');

  // One shared sender: the menu button and the header's gated actions call it.
  assert.match(header, /signInWithGoogle/);
  assert.match(header, /rememberReturnPath/);
  const helper = await readProjectFile('lib/auth-client.ts');
  assert.match(helper, /signInWithOAuth/);
  assert.match(helper, /provider:\s*"google"/);
  assert.doesNotMatch(helper, /\/auth\/sign-in/);
});

test('every account menu action maps to a route, a hidden id, or an auth action', async () => {
  // When a user exists the menu offers the session entries; each one must either
  // route somewhere real, be an entry the header deliberately hides, or be one of
  // the auth actions (sign-in / switch) the header answers with Google.
  const dropdown = await readProjectFile('components/ui/user-dropdown.tsx');
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');

  const menuActions = [...dropdown.matchAll(/action:\s*"([^"]+)"/g)].map((m) => m[1]);
  for (const required of ['profile', 'settings', 'notifications', 'help', 'saved', 'statistics', 'corrections', 'guidelines', 'about', 'switch', 'logout']) {
    assert.ok(menuActions.includes(required), `the menu must define ${required}`);
  }

  // The table names the actions the site hides on purpose, so a missing route is
  // always an explicit decision rather than an oversight.
  const table = await readProjectFile('lib/account-menu.ts');
  const routesBlock = table.slice(
    table.indexOf('export const ACCOUNT_ROUTES'),
    table.indexOf('}', table.indexOf('export const ACCOUNT_ROUTES')),
  );
  const signOutBlock = table.slice(
    table.indexOf('export const ACCOUNT_SIGN_OUT_ROUTES'),
    table.indexOf('}', table.indexOf('export const ACCOUNT_SIGN_OUT_ROUTES')),
  );
  const authBlock = table.slice(
    table.indexOf('export const ACCOUNT_AUTH_ACTIONS'),
    table.indexOf(']', table.indexOf('export const ACCOUNT_AUTH_ACTIONS')),
  );
  const routeKeys = [routesBlock, signOutBlock].flatMap((block) =>
    [...block.matchAll(/(?:^|[\s,{])"?([a-z][a-z-]*)"?\s*:/g)].map((m) => m[1]),
  );
  const authKeys = [...authBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const hiddenStart = table.indexOf('export const ACCOUNT_HIDDEN_ACTIONS = [');
  const hiddenEnd = table.indexOf(']', hiddenStart);
  assert.ok(hiddenStart > -1 && hiddenEnd > hiddenStart, 'the shared table must declare hidden actions');
  const hidden = [...table.slice(hiddenStart, hiddenEnd).matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  for (const action of menuActions) {
    assert.ok(
      hidden.includes(action) || routeKeys.includes(action) || authKeys.includes(action),
      `menu action ${action} must be routed, an auth action, or explicitly hidden`,
    );
  }

  // Log out ends the session; switch account ends it and signs in again.
  assert.match(header, /signOut/);
  assert.match(header, /action === "sign-in"/);
  assert.match(header, /action === "switch"/);

  // The account group (switch account / log out) renders only when signed in.
  assert.match(
    dropdown,
    /\{!isGuest && accountItems\.length > 0 && \(/,
    'the account group must be gated on a session',
  );
});

test('the header search is a command palette over the archive', async () => {
  // The inline header field could only hand the reader off to /search. The palette
  // opens on ⌘K, searches the published archive and offers sections and pages as
  // shortcuts, so the header must no longer ship a search input.
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /CommandPalette/);
  assert.doesNotMatch(header, /dashboard-search/);
  assert.doesNotMatch(header, /role="search"/);
  const palette = await readProjectFile('components/dashboard/command-palette.tsx');
  assert.match(palette, /metaKey/);
  assert.match(palette, /ctrlKey/);
  assert.match(palette, /\/api\/search/);
  assert.match(palette, /CATEGORIES/);
  // Archive reads belong to the endpoint; the palette must not hold a Supabase client.
  assert.doesNotMatch(palette, /supabase/i);
  const route = await readProjectFile('app/api/search/route.ts');
  assert.match(route, /search_public_articles/);
  assert.match(route, /isDemoMode/);
  assert.match(route, /no-store/);
  assert.doesNotMatch(route, /service_role|SERVICE_ROLE|secret/i);
});

test('the wordmark is centred in the top bar and gone from the rail', async () => {
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /dutimz-text-logo\.svg/);
  assert.match(header, /grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(header, /brand-icon\.svg/, 'the bar shows the wordmark at every width');
  assert.match(
    header,
    /hidden truncate text-lg font-semibold md:block/,
    'the page title belongs to desktop; phones show the wordmark alone',
  );
  const sidebar = await readProjectFile('components/dashboard/dutimz-sidebar.tsx');
  assert.doesNotMatch(sidebar, /dutimz-text-logo\.svg/);
  assert.doesNotMatch(sidebar, /brand-icon\.svg/, 'the rail carries no branding');
});

test('the header bookmark button previews saved reports in a popover', async () => {
  // The header used to show a bell that linked straight to /saved, which read as
  // notifications for a feature the site does not have. It is now a bookmark
  // that opens a popover of the reader's saved reports.
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /SavedPopover/);
  assert.doesNotMatch(header, /Bell/, 'the notification bell is gone');
  assert.doesNotMatch(header, /aria-label="Notifications"/);
  assert.ok(await exists('components/ui/popover.tsx'), 'the popover primitive must exist');
  const popover = await readProjectFile('components/dashboard/saved-popover.tsx');
  assert.match(popover, /PopoverTrigger/);
  assert.match(popover, /useSavedStories/);
  assert.match(popover, /\/saved/);
  assert.match(popover, /<SignInButton/, 'a signed-out preview offers Google sign-in, not a page');
  // The /saved page and the header preview must share one query, not drift.
  const saved = await readProjectFile('components/account/saved-stories.tsx');
  assert.match(saved, /useSavedStories/);
  const hook = await readProjectFile('lib/use-saved-stories.ts');
  assert.match(hook, /bookmarks/);
  assert.match(hook, /isSupabaseConfigured/);
});

test('every form renders through the shared field primitives', async () => {
  // One field layout for the whole site: a label, its control and a hint, laid
  // out in sections that go 1 → 2 → 3 columns. A form that hand-rolls its own
  // <select> or <textarea> is the thing this guards against.
  for (const primitive of ['field', 'select', 'textarea', 'radio-group']) {
    assert.ok(
      await exists(`components/ui/${primitive}.tsx`),
      `components/ui/${primitive}.tsx must exist`,
    );
  }
  const forms = [
    'components/account/writer-form.tsx',
    'components/account/reporter-application.tsx',
    'components/account/balance-view.tsx',
    'components/account/admin-dashboard.tsx',
    'components/account/moderation-queue.tsx',
    'components/account/questionnaire-fields.tsx',
    'components/account/gallery-uploader.tsx',
    'components/profile/profile-editor.tsx',
    'components/article/comments.tsx',
    'components/search/search-results.tsx',
  ];
  for (const path of forms) {
    const source = await readProjectFile(path);
    assert.match(source, /@\/components\/ui\/(field|select|textarea)/, `${path} must use the field primitives`);
    assert.doesNotMatch(source, /<select[\s>]/, `${path} must use the Select primitive`);
    assert.doesNotMatch(source, /<textarea[\s>]/, `${path} must use the Textarea primitive`);
  }
  // The anonymity choice is now a radio group, but the submitted contract is
  // unchanged: the RPC still receives `is_anonymous=on`.
  const writer = await readProjectFile('components/account/writer-form.tsx');
  assert.match(writer, /name="is_anonymous"/);
  assert.match(writer, /data\.get\(["']is_anonymous["']\) === ["']on["']/);
});

test('the homepage leads with the report carousel and keeps the breaking ticker', async () => {
  // The deck is the first thing under the header: newest reports, one card in
  // focus, the ticker still running above it, and the featured hero below it.
  const page = await readProjectFile('app/page.tsx');
  assert.match(page, /<CalendlyCarousel/);
  assert.match(page, /breaking=\{breaking\}/);
  const order = ['<CalendlyCarousel', 'নির্বাচিত প্রতিবেদন', 'প্রকাশনা প্রবাহ'].map(
    (needle) => {
      const at = page.indexOf(needle);
      assert.ok(at > -1, `the homepage must still render ${needle}`);
      return at;
    },
  );
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
    'the carousel must come before the featured hero and the throughput chart',
  );
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /ব্রেকিং/);

  // The reel is gone — component, section and all.
  for (const path of [
    'components/ruixen/halo-reel.tsx',
    'components/dashboard/halo-reel-section.tsx',
  ]) {
    await assert.rejects(
      () => exists(path),
      `${path} belonged to the retired reel and must not come back`,
    );
  }
  assert.doesNotMatch(page, /HaloReel/);

  // Cards come from the real archive, not from the registry demo's copy.
  assert.doesNotMatch(page, /21st\.dev/);
  assert.match(page, /storyCredit/);
  assert.match(page, /mediaUrlFor\(story\.hero_media_key\)/);
  assert.match(page, /previewStories/);
  // A story without hero art falls back to Unsplash, which next.config allows.
  assert.match(page, /images\.unsplash\.com/);
  const config = await readProjectFile('next.config.ts');
  assert.match(config, /images\.unsplash\.com/);

  const carousel = await readProjectFile('components/ui/connected-carousel.tsx');
  assert.match(carousel, /from "framer-motion"/);
  assert.match(carousel, /aria-roledescription="carousel"/);
  assert.match(carousel, /role="tablist"/);
  assert.match(carousel, /ArrowLeft/);
  assert.match(carousel, /onTouchStart=\{handleTouchStart\}/);
  assert.match(carousel, /onTouchEnd=\{handleTouchEnd\}/);
  assert.match(carousel, /onTouchCancel/);
  assert.match(carousel, /Math\.abs\(deltaX\) < Math\.abs\(deltaY\) \* 1\.25/);
  assert.match(carousel, /if \(total === 1 && offset !== 0\) return null/);
  // One ring drawn in design units and scaled to the room the page gives it — not
  // three hand-tuned layouts, which is what shipped upstream and made a phone a
  // different arrangement of the card rather than a smaller copy of it.
  assert.match(carousel, /RING_WIDTH/);
  assert.match(carousel, /new ResizeObserver/);
  assert.match(carousel, /transform: `scale\(/);
  assert.doesNotMatch(carousel, /ScreenTier|peekW/, 'the phone-only geometry must be gone');
  // The box is reserved in CSS, so the ring appearing does not move the page.
  assert.match(carousel, /aspectRatio:/);
  // Every card carries its section badge and short description at every width;
  // a deck that showed only the headline read as empty.
  assert.doesNotMatch(carousel, /DETAIL_MIN_SCALE|showDetail/);
  assert.match(carousel, /item\.category/);
  assert.match(carousel, /item\.quote/);
  // The dots keep their thumb-sized hit area; swipes are an additional phone control.
  assert.match(carousel, /dotHit/);
  // An auto-rotating deck has to stop when the reader asks motion to stop.
  assert.match(carousel, /prefers-reduced-motion/);
  // Its accessible names speak the site's language, like every other label.
  assert.doesNotMatch(carousel, /"Customer stories"|"Use cases"/);
  assert.match(carousel, /aria-label="সাম্প্রতিক প্রতিবেদনের ক্যারোসেল"/);

  const pkg = JSON.parse(await readProjectFile('package.json'));
  assert.ok(pkg.dependencies['framer-motion'], 'the deck needs framer-motion');
  assert.ok(!pkg.dependencies.motion, "the reel's own motion package must be gone");
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
  assert.match(writer, /p_questionnaire_answers/);
  assert.match(writer, /p_questionnaire_version_id/);
  assert.match(writer, /p_media_keys/);
  assert.match(writer, /p_hero_media_key/);
  assert.doesNotMatch(writer, /\.from\(['"]articles['"]\)\.insert/);
  const questionnaire = await readProjectFile('components/account/questionnaire-fields.tsx');
  assert.match(questionnaire, /get_active_article_questionnaire|QuestionnaireVersion/);
  assert.match(questionnaire, /condition/);
  const gallery = await readProjectFile('components/account/gallery-uploader.tsx');
  assert.match(gallery, /\/upload/);
  assert.match(gallery, /HEIC/);
  const application = await readProjectFile('components/account/reporter-application.tsx');
  assert.match(application, /rpc\(['"]apply_reporter['"]/);
});

test('money and moderation flow through the audited RPCs', async () => {
  const balance = await readProjectFile('components/account/balance-view.tsx');
  assert.match(balance, /rpc\(['"]request_withdrawal['"]/);
  assert.match(balance, /p_amount_tk/);
  assert.match(balance, /p_method/);
  assert.match(balance, /p_payout_number/);
  const moderation = await readProjectFile('components/account/moderation-queue.tsx');
  assert.match(moderation, /rpc\(['"]moderate_article['"]/);
  assert.match(moderation, /rpc\(['"]moderate_comment['"]/);
  assert.match(moderation, /status.*pending|eq\(['"]status['"], ['"]pending['"]\)/);
  const admin = await readProjectFile('components/account/admin-dashboard.tsx');
  assert.match(admin, /rpc\(['"]admin_member_records['"]/);
  assert.match(admin, /rpc\(['"]review_withdrawal['"]/);
  assert.match(admin, /rpc\(['"]assign_user_role['"]/);
  assert.match(admin, /rpc\(['"]admin_adjust_balance['"]/);
});

test('admin members are managed from a sortable table, not a UUID form', async () => {
  // Role editing happens on the member's own row: the table already holds the
  // member id for the audited RPC, so the UUID-paste role form is gone. The
  // finance RPCs stay wired to their own cards.
  const admin = await readProjectFile('components/account/admin-dashboard.tsx');
  assert.match(admin, /<Table aria-label="সদস্য তালিকা">/);
  assert.match(admin, /SortableHead/);
  assert.match(admin, /assign_user_role/);
  assert.match(admin, /Dialog/);
  assert.doesNotMatch(admin, /role-user/);
  assert.doesNotMatch(admin, /ভূমিকা নির্ধারণ/);
  assert.match(admin, /review_withdrawal/);
  assert.match(admin, /admin_adjust_balance/);
  assert.ok(await exists('components/ui/table.tsx'), 'components/ui/table.tsx must exist');
  assert.ok(await exists('components/ui/dialog.tsx'), 'components/ui/dialog.tsx must exist');
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

test("every overlay and disclosure animates at the dropdown's 150ms", async () => {
  // Each surface used to carry its own timing — the mobile drawer slid in over
  // half a second, the tree unfolded over 300ms, and the account dropdown took
  // 150ms — so the same tap felt different everywhere. They all match now.
  for (const primitive of [
    'dropdown-menu',
    'popover',
    'dialog',
    'sheet',
    'tooltip',
    'animated-file-tree',
  ]) {
    const source = await readProjectFile(`components/ui/${primitive}.tsx`);
    assert.ok(source.includes('duration-150'), `${primitive} must animate at 150ms`);
    assert.doesNotMatch(
      source,
      /duration-(?:200|300|500|700|1000)\b/,
      `${primitive} must not ship a slower duration`,
    );
  }
});

test('reader-facing errors never show raw provider text', async () => {
  // A misconfigured build used to print the provider's own words to readers:
  // "@supabase/ssr: Your project's URL and API key are required to create a
  // Supabase client!" landed verbatim on /saved and in the header bookmark
  // popover. Supabase-backed UI logs errors through @/lib/errors and renders
  // fixed, operation-specific Bengali text rather than provider messages.
  const surfaces = [
    'components/account/account-dashboard.tsx',
    'components/account/admin-dashboard.tsx',
    'components/account/balance-view.tsx',
    'components/account/gallery-uploader.tsx',
    'components/account/moderation-queue.tsx',
    'components/account/reporter-application.tsx',
    'components/account/role-gate.tsx',
    'components/account/writer-form.tsx',
    'components/article/article-actions.tsx',
    'components/article/comments.tsx',
    'components/auth/sign-in-button.tsx',
    'components/corrections/corrections-list.tsx',
    'components/dashboard/command-palette.tsx',
    'components/dashboard/dashboard-header.tsx',
    'components/profile/profile-editor.tsx',
    'components/profile/public-profile.tsx',
    'components/search/search-results.tsx',
    'components/statistics/public-stats.tsx',
    'lib/use-saved-stories.ts',
  ];
  for (const path of surfaces) {
    const source = await readProjectFile(path);
    assert.match(source, /from "@\/lib\/errors"/, `${path} must route errors through @/lib/errors`);
  }

  // Nothing under components/ may read a provider message into state or JSX.
  const offenders = [];
  for (const entry of readdirSync(componentsDir, { recursive: true })) {
    const relative = String(entry).replaceAll('\\', '/');
    if (!relative.endsWith('.tsx')) continue;
    const source = await readProjectFile(`components/${relative}`);
    if (/(?:\berr|\berror|\.error|\.data\.error)\.message\b/.test(source)) {
      offenders.push(relative);
    }
  }
  assert.deepEqual(offenders, [], 'components must not inspect or render exception messages');

  const nonUiSupabase = [
    'app/api/search/route.ts',
    'lib/stories.ts',
    'worker/src/index.ts',
  ];
  for (const path of nonUiSupabase) {
    const source = await readProjectFile(path);
    assert.ok(source.includes('reportError') || source.includes('console.error'), `${path} must keep provider detail in server-side logs`);
  }
  const route = await readProjectFile('app/api/search/route.ts');
  assert.doesNotMatch(route, /error\.message|detail\s*:\s*error/);
  assert.match(route, /unavailable:\s*true/);

  const helper = await readProjectFile('lib/errors.ts');
  assert.ok(helper.includes('console.error'), 'the raw failure detail must be logged');
  assert.ok(helper.includes('reportError(context, error)'));
  assert.ok(helper.includes('return fallback;'), 'reader-facing text must be a fixed fallback');
  assert.ok(!helper.includes('error.message') && !helper.includes('String(error)'));
  assert.ok(helper.includes('isUniqueViolation'));

  // The raw-text escape hatch (break-all sized for URLs and tokens) is gone.
  const saved = await readProjectFile('components/account/saved-stories.tsx');
  assert.doesNotMatch(saved, /break-all/);
  assert.doesNotMatch(saved, /লোড করা যায়নি: \{message\}/);
  const popover = await readProjectFile('components/dashboard/saved-popover.tsx');
  assert.doesNotMatch(popover, /break-all/);
});

test('known profile username collisions use fixed Bengali guidance', async () => {
  const helper = await readProjectFile('lib/errors.ts');
  assert.ok(helper.includes('23505'));
  assert.ok(helper.includes('return fallback;'));
  assert.ok(helper.includes('console.error'));
  const profile = await readProjectFile('components/profile/profile-editor.tsx');
  assert.ok(profile.includes('isUniqueViolation(profileResult.error)'));
  assert.ok(profile.includes('এই ইউজারনেমটি ইতিমধ্যে ব্যবহৃত। অন্য একটি বেছে নিন।'));
});

test('Supabase failures use safe Bengali fallbacks and never render exception text', async () => {
  const files = [
    'components/account/account-dashboard.tsx',
    'components/account/admin-dashboard.tsx',
    'components/account/balance-view.tsx',
    'components/account/gallery-uploader.tsx',
    'components/account/moderation-queue.tsx',
    'components/account/reporter-application.tsx',
    'components/account/role-gate.tsx',
    'components/account/writer-form.tsx',
    'components/article/article-actions.tsx',
    'components/article/comments.tsx',
    'components/auth/sign-in-button.tsx',
    'components/corrections/corrections-list.tsx',
    'components/dashboard/command-palette.tsx',
    'components/dashboard/dashboard-header.tsx',
    'components/profile/profile-editor.tsx',
    'components/profile/public-profile.tsx',
    'components/search/search-results.tsx',
    'components/statistics/public-stats.tsx',
    'lib/use-saved-stories.ts',
  ];
  for (const path of files) {
    const source = await readProjectFile(path);
    assert.ok(source.includes('@/lib/errors'), `${path} must use the shared safe logger`);
  }
  for (const entry of readdirSync(componentsDir, { recursive: true })) {
    const relative = String(entry).replaceAll('\\', '/');
    if (!relative.endsWith('.tsx')) continue;
    const source = await readProjectFile(`components/${relative}`);
    assert.ok(!source.includes('.message'), `${relative} must not read exception messages`);
  }
  const palette = await readProjectFile('components/dashboard/command-palette.tsx');
  assert.ok(palette.includes('প্রতিবেদন খোঁজা যাচ্ছে না। আবার চেষ্টা করুন।'));
  const search = await readProjectFile('components/search/search-results.tsx');
  assert.ok(search.includes('খবর খোঁজা যাচ্ছে না। আবার চেষ্টা করুন।'));
  const helper = await readProjectFile('lib/errors.ts');
  assert.ok(helper.includes('console.error'), 'raw details are logged');
  assert.ok(helper.includes('return fallback;'), 'only fixed Bengali fallback text is returned');
  assert.ok(!helper.includes('error.message'));
  assert.ok(!helper.includes('String(error)'));
  const saved = await readProjectFile('lib/use-saved-stories.ts');
  assert.ok(saved.includes('সংরক্ষিত প্রতিবেদন লোড করা যায়নি'));
  const profile = await readProjectFile('components/profile/profile-editor.tsx');
  assert.ok(profile.includes('এই ইউজারনেমটি ইতিমধ্যে ব্যবহৃত। অন্য একটি বেছে নিন।'));
});

test('shadcn primitives required by the dashboard shell exist', async () => {
  for (const primitive of ['animated-file-tree', 'avatar', 'badge', 'button', 'card', 'chart', 'command', 'connected-carousel', 'field', 'input', 'popover', 'radio-group', 'select', 'separator', 'skeleton', 'textarea', 'tooltip', 'sheet', 'label', 'progress', 'sidebar']) {
    assert.ok(await exists(`components/ui/${primitive}.tsx`), `components/ui/${primitive}.tsx must exist`);
  }
});
