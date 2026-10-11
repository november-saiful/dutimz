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
    'app/flipps/page.tsx',
    'app/flipps/[slug]/page.tsx',
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
    'app/spotlight/page.tsx',
    'app/spotlight/[id]/page.tsx',
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

test('the top bar is the reference design\'s bar: mark, section pills, search, account', async () => {
  // The sidebar, the phone dock and the command palette retired with the
  // redesign: navigation is the design's pill bar fed by the real desks, and
  // phones get the same pills behind the burger. The account menu stays the
  // session dropdown.
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /className="topbar"/);
  assert.match(header, /className="logo"/);
  assert.match(header, /brand-icon\.svg/, 'the mark leads the bar');
  assert.match(header, /pill\$\{active \? " active" : ""\}/, 'the desks are pills with a real active state');
  assert.match(header, /id="site-nav"/);
  assert.match(header, /aria-controls="site-nav"/, 'the burger is a disclosure over the pills');
  assert.match(header, /aria-expanded=\{menuOpen\}/);
  assert.match(header, /UserDropdown/);
  for (const path of [
    'components/dashboard/dutimz-sidebar.tsx',
    'components/dashboard/sidebar-state.tsx',
    'components/dashboard/mobile-bottom-nav.tsx',
    'components/dashboard/command-palette.tsx',
    'components/ui/sidebar.tsx',
  ]) {
    await assert.rejects(
      () => exists(path),
      `${path} belonged to the retired rail, dock or palette and must not come back`,
    );
  }
});

test('the shell wraps every page with the top bar and the footer', async () => {
  const shell = await readProjectFile('components/dashboard/dutimz-shell.tsx');
  assert.match(shell, /DashboardHeader/);
  assert.match(shell, /SiteFooter/);
  assert.match(shell, /getNavCategories/, 'the bar and the footer share one desk read');
  assert.match(shell, /bare/, 'bare pages draw their own containers');
  const footer = await readProjectFile('components/dashboard/site-footer.tsx');
  for (const href of [
    '/spotlight/',
    '/statistics/',
    '/corrections/',
    '/saved/',
    '/about/',
    '/guidelines/',
    '/account/write/',
  ]) {
    assert.ok(footer.includes(`href="${href}"`), `the footer must link ${href}`);
  }
  // The columns carry the real desks from the database, not a fixed link farm.
  assert.match(footer, /sections\s*\.filter/);
  assert.match(footer, /mailto:hello@dutimz\.com/);
  const subscribe = await readProjectFile('components/dashboard/subscribe-form.tsx');
  assert.match(
    subscribe,
    /mailto:hello@dutimz\.com/,
    'the subscribe box must perform a real action, not swallow the address',
  );
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
  for (const route of ['/account/', '/saved/', '/u/']) {
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
  for (const required of ['dashboard', 'my-profile', 'saved', 'logout']) {
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

  // Log out ends the session.
  assert.match(header, /signOut/);
  assert.match(header, /action === "sign-in"/);

  // The signed-in rows (dashboard, my profile, log out) render only with a session.
  assert.match(
    dropdown,
    /isGuest \? GUEST_ITEMS : ACCOUNT_ITEMS/,
    'the signed-in rows must be gated on a session',
  );
});

test('the top bar search sends the reader to the archive page', async () => {
  // The design's search field is a real form: it submits to /search with the
  // reader's query, and the archive endpoint stays the only place that reads
  // the published index.
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /role="search"/);
  assert.match(header, /\/search\/\?q=/, 'the field submits the query to the archive page');
  assert.match(header, /aria-label="খুঁজুন"/);
  assert.doesNotMatch(header, /CommandPalette/);
  const route = await readProjectFile('app/api/search/route.ts');
  assert.match(route, /search_public_articles/);
  assert.match(route, /isDemoMode/);
  assert.match(route, /no-store/);
  assert.doesNotMatch(route, /service_role|SERVICE_ROLE|secret/i);
});

test('the mark and the wordmark lead the top bar at every width', async () => {
  // The design puts the brand on the left of the bar — mark plus wordmark —
  // and the footer repeats it beside the copyright.
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /brand-icon\.svg/);
  assert.match(header, /<b>DUTIMZ<\/b>/);
  assert.doesNotMatch(header, /dutimz-text-logo\.svg/, 'the old centred lockup is gone');
  const footer = await readProjectFile('components/dashboard/site-footer.tsx');
  assert.match(footer, /brand-icon\.svg/, 'the footer carries the mark beside the copyright');
});

test('saved content moved out of the header into the account menu', async () => {
  // The top bar used to carry a bookmark button that opened a saved-reports
  // popover. Saved content is now an entry in the account menu instead, and the
  // popover component is gone.
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.doesNotMatch(header, /SavedPopover/, 'the header must not render a saved popover');
  assert.doesNotMatch(header, /Bookmark/, 'the bookmark button is gone');
  const dropdown = await readProjectFile('components/ui/user-dropdown.tsx');
  assert.match(dropdown, /সংরক্ষিত কনটেন্ট/);
  await assert.rejects(
    () => exists('components/dashboard/saved-popover.tsx'),
    'the saved popover component must be removed',
  );
  // The /saved page keeps its own query and sign-in prompt.
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
    'components/profile/profile-edit-dialog.tsx',
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

test('the homepage is the reference design\'s home view over the real archive', async () => {
  // The front page is the design's composition — hero with the orb, the three
  // previews, the recommended rail, the latest rows and the two carousels —
  // and every slot is filled from the archive read. An approved story still
  // has to appear at once, so the route renders per request.
  const page = await readProjectFile('app/page.tsx');
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /<DutimzShell bare>/);
  assert.match(page, /hero-grid/);
  assert.match(page, /aria-label="প্রধান প্রতিবেদন"/);
  assert.match(page, /সপ্তাহের সেরা/, 'the hero keeps the design\'s flag');
  assert.match(page, /<Orb \/>/, 'the hero carries the design\'s orb');
  assert.match(page, /className="previews"/);
  assert.match(page, /hero-aside/);
  assert.match(page, /প্রস্তাবিত/);
  assert.match(page, /সর্বশেষ খবর/);
  assert.match(page, /পাঠকের পছন্দ/);
  assert.match(page, /মাসের সেরা/);
  assert.match(page, /<StoryCarousel/);
  // Demo and empty states come from the preview fixture, never a blank page.
  assert.match(page, /previewStories/);
  assert.match(page, /<EmptyDesk/);
  assert.match(page, /href="\/account\/write\/"/, 'the empty state points at the write form');
  // Cards come from the real archive and link each story's own canonical
  // address with its own media — never the registry demo's copy.
  assert.doesNotMatch(page, /21st\.dev/);
  const blocks = await readProjectFile('components/dashboard/story-blocks.tsx');
  assert.match(blocks, /\/news\/\$\{encodeURIComponent\(item\.slug\)\}\//);
  assert.match(blocks, /storyCredit/);
  assert.match(blocks, /mediaUrlFor\(story\.hero_media_key\)/);
  // The retired deck and reel stay gone — component, section and all.
  assert.doesNotMatch(page, /CalendlyCarousel/);
  assert.doesNotMatch(page, /HaloReel/);
  for (const path of [
    'components/ruixen/halo-reel.tsx',
    'components/dashboard/halo-reel-section.tsx',
  ]) {
    await assert.rejects(
      () => exists(path),
      `${path} belonged to the retired reel and must not come back`,
    );
  }
  // The preview fixtures fall back to Unsplash art, which next.config allows.
  const stories = await readProjectFile('lib/stories.ts');
  assert.match(stories, /images\.unsplash\.com/);
  const config = await readProjectFile('next.config.ts');
  assert.match(config, /images\.unsplash\.com/);

  const pkg = JSON.parse(await readProjectFile('package.json'));
  assert.ok(pkg.dependencies['framer-motion'], 'animated-file-tree still needs framer-motion');
  assert.ok(!pkg.dependencies.motion, "the reel's own motion package must be gone");
});

test('the front page serves every slot from one archive read', async () => {
  // One read serves the whole front page: the hero slots, the rails and both
  // carousels are picked from the same newest-first list, and a short feed
  // cycles its own stories rather than leaving holes.
  const page = await readProjectFile('app/page.tsx');
  assert.match(page, /getLatestStories\(25\)/);
  const reads = page.match(/getLatestStories\(/g) ?? [];
  assert.equal(reads.length, 1, 'the front page must take one read, not one per slot');
  assert.match(page, /pick\(items, 0\)/, 'the lead slot comes from that list');
  assert.match(page, /pick\(items, 4\)/, 'the recommended rail comes from that list');
});

test('a shared story carries its own picture, not the site logo', async () => {
  const article = await readProjectFile('app/news/[slug]/page.tsx');
  assert.match(article, /openGraph:[\s\S]*images:/, 'the page must set its own og:image');
  assert.match(article, /twitter:[\s\S]*summary_large_image/);
  assert.match(article, /width: 1200, height: 630/, 'the card needs the large-image dimensions');
  assert.match(article, /shareImageFor\(article\)/, "the crawler picture is the story's own media");
  // The rule moved into the archive module so the article and the reel deck cannot state it two
  // ways: the hero, else the first gallery picture, else the banner.
  const stories = await readProjectFile('lib/stories.ts');
  assert.match(stories, /export function shareImageFor/);
  assert.match(stories, /hero_media_key \?\?/);
  assert.match(stories, /article_media/);
  assert.match(stories, /og-banner\.png/, 'a story without art falls back to the banner');
  const layout = await readProjectFile('app/layout.tsx');
  assert.match(layout, /twitter:[\s\S]*images:/, 'every other page still gets a default card image');
});

test('the reel deck reads the archive and asks the reader for nothing', async () => {
  const page = await readProjectFile('app/flipps/page.tsx');
  assert.match(page, /getLatestStories/, 'the deck reads the published archive');
  assert.match(page, /FlippsReels/);
  assert.match(page, /DutimzShell bare/, 'a deck of full-screen cards draws its own container');
  const reels = await readProjectFile('components/flipps/flipps-reels.tsx');
  assert.match(reels, /snap-y snap-mandatory/, 'a reel is reached by snapping, not by a page load');
  assert.match(reels, /onKeyDown/, 'the deck is steppable from the keyboard');
  assert.match(
    reels,
    /ShareStory href=\{item\.reelHref\}/,
    'a shared reel points at its own address, not the article it summarises',
  );
  assert.doesNotMatch(reels, /supabase/i, 'the deck holds no database client');
  assert.doesNotMatch(reels, /comment/i, 'the deck carries no comment surface');
});

test('a shared reel opens the deck on the story it was posted for', async () => {
  const share = await readProjectFile('app/flipps/[slug]/page.tsx');
  assert.match(share, /notFound\(\)/, 'an unclaimed slug is a genuine 404');
  assert.match(share, /shareImageFor/, "the preview carries the story's own picture");
  assert.match(share, /openGraph/);
  assert.match(
    share,
    /\[reel, \.\.\.rest\.filter/,
    'the shared reel leads the deck, so nothing has to be scrolled into place after hydration',
  );
  assert.ok(share.includes('slice(0, REEL_COUNT)'), 'a shared link costs no more than the deck');
});

test('a story link can be copied and previewed before it is published', async () => {
  const writer = await readProjectFile('components/account/writer-form.tsx');
  assert.match(writer, /navigator\.clipboard\.writeText/, 'the copy button uses the clipboard');
  assert.match(writer, /SITE_URL\}\/news\//, "the copied link is the article's own address");
  assert.match(writer, /result\.data[\s\S]*slug/, 'the real slug comes from the RPC response');
  assert.doesNotMatch(writer, /slice\(0, 24\)/, 'no slug is guessed from the Bengali title');
  const news = await readProjectFile('app/news/[slug]/page.tsx');
  assert.match(news, /articleSlugExists/, 'an unpublished slug is told apart from an unknown one');
  assert.match(news, /<PendingArticle/);
  const pending = await readProjectFile('components/article/pending-article.tsx');
  assert.match(pending, /get_my_article_by_slug/);
  assert.match(pending, /AuthedMediaImage/, "private pictures load with the reader's token");
  const stories = await readProjectFile('lib/stories.ts');
  assert.match(stories, /article_slug_exists/);
  const migration = await readProjectFile('supabase/migrations/202610030001_article_preview.sql');
  assert.match(migration, /get_my_article_by_slug/);
  assert.match(migration, /is_moderator_or_admin\(\)/, 'only the author or the desk may read it');
});

test('the article body fills its column instead of leaving a blank band', async () => {
  const article = await readProjectFile('app/news/[slug]/page.tsx');
  assert.doesNotMatch(article, /max-w-\[68ch\]/, 'the one-sided blank band must be gone');
  assert.match(article, /className="article-body"/);
  const css = await readProjectFile('app/globals.css');
  assert.match(css, /\.article-main p\s*\{/, 'body copy keeps the design\'s own measure and rhythm');
});

test('the site paints without a blocking font and keeps motion on CSS', async () => {
  const layout = await readProjectFile('app/layout.tsx');
  assert.match(layout, /next\/font\/google/, 'the type is self-hosted');
  assert.doesNotMatch(layout, /fonts\.googleapis\.com/, 'no render-blocking stylesheet remains');
  assert.match(layout, /--font-inter/, 'Latin text renders in the design\'s Inter');
  assert.match(layout, /--font-bengali/, 'Bengali falls through to the paired Bengali face');
  const css = await readProjectFile('app/globals.css');
  assert.match(css, /prefers-reduced-motion: reduce/, 'a global reduced-motion reset');
  // Glass is a dose-capped accent: only the sticky bars may blur — the top bar,
  // the article bar, and the phone dock's floating card.
  const blur = css.match(/^\s*backdrop-filter: blur/gm) ?? [];
  assert.ok(blur.length <= 3, 'backdrop blur belongs to the sticky bars alone');
  const page = await readProjectFile('app/page.tsx');
  assert.doesNotMatch(page, /requestAnimationFrame/, 'no frame loop re-renders the page');
  // recharts stays out of the initial bundle: the homepage imports no chart,
  // and the lazy wrapper still suspends what it loads to the client.
  assert.doesNotMatch(page, /recharts/);
  const lazy = await readProjectFile('components/dashboard/throughput-chart-lazy.tsx');
  assert.match(lazy, /next\/dynamic/);
  assert.match(lazy, /ssr: false/);
  const dropdown = await readProjectFile('components/ui/user-dropdown.tsx');
  assert.doesNotMatch(dropdown, /@iconify\/react/, 'no runtime icon fetch');
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.doesNotMatch(header, /backdrop-blur/, 'the blur lives in the stylesheet, on the bars alone');
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
  // Money is adjusted from a member's own row or from a search that returns a member, so the
  // desk is never asked to paste an id into a field.
  assert.match(admin, /openAdjust/, 'balance entry must come from a member, not a bare id');
  assert.doesNotMatch(admin, /UUID/, 'no panel field may ask the desk to type a member id');
  assert.doesNotMatch(admin, /adjustUserId/, 'the id-paste balance form is gone');
  assert.match(admin, /<AdminArticles \/>/, 'the panel must surface stories, not only members');
  // Each member's wallet shows why the balance is what it is: the ledger rows behind the
  // totals, reached from the same dialog the adjustment form lives in.
  assert.match(admin, /from\(['"]earnings_ledger['"]\)/, 'the wallet must show the member ledger');
  assert.match(admin, /loadLedger/, 'the ledger loads when a member wallet opens');
  assert.match(admin, /LEDGER_LABELS/, 'every ledger entry type is named, not printed raw');
  assert.match(admin, /লেনদেনের ইতিহাস/, 'the history section must be labelled for the desk');
  assert.ok(await exists('components/ui/table.tsx'), 'components/ui/table.tsx must exist');
  assert.ok(await exists('components/ui/dialog.tsx'), 'components/ui/dialog.tsx must exist');
});

test('the desk settles a withdrawal from the member wallet, speaking the database\'s words', async () => {
  // Settling used to live on the finance tab as its own list, and the panel sent 'approve'/'reject'
  // while review_withdrawal accepts only 'paid'/'rejected', so neither button had ever settled a
  // request. The decision now happens inside the member's wallet dialog, with the balance it is
  // holding in view, and passes exactly the two words the function accepts.
  const admin = await readProjectFile('components/account/admin-dashboard.tsx');
  assert.match(admin, /targetWithdrawal/, 'the dialog must load the member\'s pending request');
  assert.match(admin, /settleTargetWithdrawal\(['"]paid['"]\)/, 'paying must send the word the RPC expects');
  assert.match(admin, /settleTargetWithdrawal\(['"]rejected['"]\)/, 'refusing must send the word the RPC expects');
  assert.doesNotMatch(admin, /reviewWithdrawal\([^)]*['"]approve['"]/, 'the rejected vocabulary must be gone');
  assert.doesNotMatch(admin, /reviewWithdrawal\([^)]*['"]reject['"]/, 'the rejected vocabulary must be gone');
  assert.match(admin, /rpc\(['"]review_withdrawal['"]/, 'the audited RPC is still the only way to settle');
  // The finance tab keeps the queue in view but points at the wallet dialog instead of deciding.
  assert.match(admin, /openMemberWallet/, 'the finance list must open the member wallet');
  assert.doesNotMatch(
    admin,
    /wreason-\$\{withdrawal\.id\}/,
    'the separate finance decision form must be gone',
  );
});

test('the desk manages stories from the panel, not only the pending queue', async () => {
  // The panel had no story surface at all: articles lived only in the moderation queue, which
  // lists pending submissions and nothing else. Two audited RPCs already existed and were called
  // from nowhere, and neither can take a live story down, so a third is added for that decision.
  const articles = await readProjectFile('components/account/admin-articles.tsx');
  for (const fn of [
    'admin_update_article',
    'admin_set_article_publication',
    'admin_set_article_status',
  ]) {
    assert.ok(articles.includes(fn), `${fn} must be reachable from the panel`);
  }
  assert.match(articles, /from\("articles"\)/, 'the desk lists every story, whatever its status');
  assert.doesNotMatch(articles, /UUID/, 'no story action may ask for a raw id');
  assert.doesNotMatch(articles, /\.delete\(/, 'removal stays a status change, never a row delete');
  // The author is chosen by name and resolved through the administrator-only directory.
  assert.match(articles, /admin_member_records/);
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
    'components/dashboard/dashboard-header.tsx',
    'components/profile/profile-edit-dialog.tsx',
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
});

test('a member cannot change their own username from any client surface', async () => {
  const helper = await readProjectFile('lib/errors.ts');
  assert.ok(helper.includes('23505'));
  assert.ok(helper.includes('return fallback;'));
  assert.ok(helper.includes('console.error'));
  // The editor modal never writes the handle: update(username) is revoked and the
  // desk RPC is the only path. The field is shown read-only.
  const dialog = await readProjectFile('components/profile/profile-edit-dialog.tsx');
  assert.doesNotMatch(dialog, /username:\s*values\.username/, 'the editor must not write the username');
  assert.match(dialog, /readOnly/);
  const admin = await readProjectFile('components/account/admin-dashboard.tsx');
  assert.match(admin, /admin_update_member/, 'the desk can still change a handle through the audited RPC');
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
    'components/dashboard/dashboard-header.tsx',
    'components/profile/profile-edit-dialog.tsx',
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
  const search = await readProjectFile('components/search/search-results.tsx');
  assert.ok(search.includes('খবর খোঁজা যাচ্ছে না। আবার চেষ্টা করুন।'));
  const helper = await readProjectFile('lib/errors.ts');
  assert.ok(helper.includes('console.error'), 'raw details are logged');
  assert.ok(helper.includes('return fallback;'), 'only fixed Bengali fallback text is returned');
  assert.ok(!helper.includes('error.message'));
  assert.ok(!helper.includes('String(error)'));
  const saved = await readProjectFile('lib/use-saved-stories.ts');
  assert.ok(saved.includes('সংরক্ষিত প্রতিবেদন লোড করা যায়নি'));
});

test('the phone menu shows the same desks behind the burger', async () => {
  // Phones get the design's burger: a disclosure over the same section pills
  // the desktop bar shows, so a reader on a phone loses no destination.
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /className="burger"/);
  assert.match(header, /id="site-nav"/);
  assert.match(header, /menuOpen \? " open" : ""/, 'the nav opens through the design\'s own class');
  assert.match(header, /aria-expanded=\{menuOpen\}/);
  assert.match(header, /aria-label="মেনু"/);
  const shell = await readProjectFile('components/dashboard/dutimz-shell.tsx');
  assert.doesNotMatch(shell, /MobileBottomNav/, 'the retired phone dock stays gone');
});

test('the phone dock carries the five primary destinations, and only on a phone', async () => {
  // A phone gets a floating dock over the foot of the page: the five places a
  // reader moves between, drawn from the reference deck's morphing tab bar. It is
  // a different surface from the retired rail dock — the burger still holds every
  // desk — and only the five primary destinations live on it.
  const dock = await readProjectFile('components/dashboard/mobile-dock.tsx');
  assert.match(dock, /^"use client";/m, 'the dock is the island that reads the address');
  assert.match(dock, /usePathname/, 'the current tab follows the address');
  assert.match(dock, /aria-current=\{isCurrent \? "page" : undefined\}/, 'the current tab says so');
  assert.match(dock, /aria-label="প্রধান নেভিগেশন"/);
  const shell = await readProjectFile('components/dashboard/dutimz-shell.tsx');
  assert.match(shell, /<MobileDock \/>/, 'every page draws the dock');

  // The five entries, each on the address the rest of the site already publishes.
  for (const [key, href] of [
    ['home', '"/"'],
    ['flipps', '"/flipps/"'],
    ['search', '"/search/"'],
    ['spotlight', '"/spotlight/"'],
    ['account', '"/account/"'],
  ]) {
    assert.match(
      dock,
      new RegExp(`key: "${key}",\\s*\\n\\s*href: ${href.replaceAll('/', '\\/')},`),
      `the dock must carry ${key} to ${href}`,
    );
  }

  // The morph is the stylesheet's job, on the reference's own curve: the open tab
  // is exactly as wide as its word, and a collapsed label still reports that width
  // so the dock can measure it instead of guessing.
  const css = await readProjectFile('app/globals.css');
  const phone = css.slice(
    css.indexOf('.dock {'),
    css.indexOf('/* ============ RESPONSIVE'),
  );
  assert.ok(phone.length > 0, 'the dock must have its own stylesheet section');
  assert.match(
    dock,
    /selectNodeContents/,
    'the open tab is sized from the label the dock measured, not from a guess',
  );
  assert.match(phone, /width: var\(--dock-label, 0px\)/, 'the open tab takes the measured width');
  assert.match(
    css,
    /--dock-ease: cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
    "the reference's morph curve is a token, not a guess repeated per rule",
  );
  assert.match(phone, /var\(--dock-ease\)/, 'the tab, its pill and its label all move on it');
  // Phone-only: it reveals itself at the breakpoint where the top bar hands its
  // desks to the burger, and it reserves the room it floats over.
  assert.match(phone, /@media \(max-width: 860px\)/, 'the dock is a phone surface');
  assert.match(phone, /visibility: visible/, 'it reveals itself at the burger breakpoint');
  assert.match(phone, /padding-bottom: var\(--dock\)/, 'the page reserves the dock its room');
  const reels = await readProjectFile('components/flipps/flipps-reels.tsx');
  assert.match(
    reels,
    /100svh-var\(--topbar\)-var\(--dock\)-1\.5rem\)/,
    'the reel deck ends above the dock instead of under it',
  );
});

test('spotlight authors remove their own posts; the desk hides or removes any', async () => {
  const forum = await readProjectFile('components/forum/spotlight-forum.tsx');
  assert.match(forum, /delete_my_spotlight_post/, 'the author removes through the audited RPC');
  assert.match(forum, /rpc\(/, 'the removal goes through an RPC, never a direct write');
  assert.doesNotMatch(forum, /\.from\(['"]spotlight_posts['"]\)\.delete/, 'no client-side delete');
  assert.match(forum, /status !== "visible"/, 'a hidden post is labelled');
  const admin = await readProjectFile('components/account/admin-dashboard.tsx');
  assert.match(admin, /admin_set_spotlight_status/, 'the desk moderates through the audited RPC');
  for (const decision of ['"hide"', '"restore"', '"remove"']) {
    assert.ok(admin.includes(decision), `the desk must offer ${decision}`);
  }
});

test('the spotlight feed pages instead of stopping at thirty posts', async () => {
  const forum = await readProjectFile('components/forum/spotlight-forum.tsx');
  assert.match(forum, /\.range\(/, 'the feed pages through the archive');
  assert.match(forum, /PAGE_SIZE/, 'the page size lives in one constant');
  assert.match(forum, /loadMore/, 'the next page is appended on demand');
  assert.doesNotMatch(forum, /\.limit\(\s*30\s*\)/, 'the hard thirty-post ceiling is gone');
});

test('one Supabase browser client is shared by every surface', async () => {
  // `createBrowserClient` builds a new GoTrue client on every call, and `supabaseBrowser()` is
  // called from the effect of nearly every interactive component. A dozen of them sharing one
  // storage key race over the same refresh token, and the loser gets a 400 from Supabase's
  // token endpoint and concludes it is signed out — which is how a signed-in reporter was told
  // to sign in before uploading a photo.
  const source = await readProjectFile('lib/supabase.ts');
  assert.match(
    source,
    /browserClient\s*\?\?=|if \(!browserClient\)/,
    'supabaseBrowser must reuse one client instead of building a new one per call',
  );
  const body = source.slice(source.indexOf('export function supabaseBrowser'));
  assert.doesNotMatch(
    body.slice(0, body.indexOf('\n}')),
    /return createBrowserClient\(/,
    'the factory must not be called on every invocation',
  );
});

test('the uploader sends the shared browser session, not a private client', async () => {
  // The upload path originally built its own supabase-js client from the public URL and anon
  // key on every upload. That bypasses `@supabase/ssr`: the session lives in the ssr cookie
  // store, so the private client read localStorage, found no session, and threw "sign in with
  // Google" at a reporter who was already signed in. The memoized `supabaseBrowser()` is the
  // only client that shares the app's session.
  const uploader = await readProjectFile('components/account/gallery-uploader.tsx');
  assert.match(
    uploader,
    /import \{ freshAccessToken \} from "@\/lib\/supabase"/,
    'the uploader must take its token from the shared session',
  );
  assert.doesNotMatch(
    uploader,
    /from "@supabase\/supabase-js"/,
    'the uploader must not build its own supabase-js client',
  );
  assert.match(uploader, /freshAccessToken\(\)/, 'the uploader asks for a usable token');
});

test('an upload never sends an expired access token', async () => {
  // `getSession()` returns the stored session without refreshing it, so a session older than
  // its one-hour access token still looks signed in while every request it authorises is
  // refused. The uploader sent that dead token and the media Worker answered 401, which read
  // to the reporter as "sign in with Google" while they were already signed in.
  const source = await readProjectFile('lib/supabase.ts');
  const body = source.slice(source.indexOf('export async function freshAccessToken'));
  assert.match(body, /refreshSession\(\)/, 'an expired session must be refreshed');
  assert.match(body, /expires_at/, 'the decision must be based on the token expiry');
  const uploader = await readProjectFile('components/account/gallery-uploader.tsx');
  assert.match(uploader, /Bearer \$\{token\}/, 'the upload must send the checked token');
});

test('only lib/supabase.ts and the OAuth callback touch the Supabase SDKs', async () => {
  // Two clients exist by design: `lib/supabase.ts` owns the anonymous server client and the one
  // memoized browser client, and the OAuth callback builds a cookie-writing server client it
  // must have. Any other file that reaches into @supabase/* chooses a session store the app does
  // not write to — which is exactly how the uploader decided a signed-in reporter was signed
  // out. This walks the source tree so a new surface cannot quietly reintroduce the mismatch.
  const walk = (url) =>
    readdirSync(url, { withFileTypes: true }).flatMap((entry) => {
      const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
      return entry.isDirectory() ? walk(child) : [child];
    });
  const roots = ['../app/', '../components/', '../lib/'];
  const sources = roots.flatMap((root) => walk(new URL(root, import.meta.url)));
  const allowed = new Set(
    ['../lib/supabase.ts', '../app/auth/callback/route.ts'].map((path) =>
      fileURLToPath(new URL(path, import.meta.url)),
    ),
  );
  let scanned = 0;
  for (const url of sources) {
    if (!/\.(ts|tsx)$/.test(url.pathname)) continue;
    if (allowed.has(fileURLToPath(url))) continue;
    scanned += 1;
    const source = await readFile(url, 'utf8');
    assert.doesNotMatch(
      source,
      /from ["']@supabase\//,
      `${fileURLToPath(url)} must go through lib/supabase.ts instead of building its own client`,
    );
  }
  assert.ok(scanned > 50, 'the walk must actually reach the source tree');
});

test('a story is submitted with the excerpt argument the RPC requires', async () => {
  // The excerpt is derived server-side and never typed, but `p_excerpt` is a required argument
  // of submit_article: PostgreSQL will not let it default, because a defaulted parameter cannot
  // be followed by a required one and the body comes after it. PostgREST matches a function by
  // the argument names in the request, so a submission that omits the key matches no function
  // at all and answers 404 — the report is never created, and nothing in the UI says why.
  const form = await readProjectFile('components/account/writer-form.tsx');
  assert.match(form, /rpc\("submit_article"/);
  assert.match(
    form,
    /p_excerpt:\s*null/,
    'the writer form must send p_excerpt, passing null to mean "derive it"',
  );
});

test('the desk is not forced to type a reason, and is told why a username was refused', async () => {
  const admin = await readProjectFile('components/account/admin-dashboard.tsx');
  // Scoped to the member dialog: the withdrawal, Spotlight and balance forms still label
  // their own reason required, which is deliberate.
  assert.match(
    admin,
    /label="কারণ \(ঐচ্ছিক\)"/,
    'the member dialog reason field must say it is optional',
  );
  const reasonField = admin.slice(
    admin.indexOf('id="edit-reason"'),
    admin.indexOf('</Field>', admin.indexOf('id="edit-reason"')),
  );
  assert.notEqual(reasonField.length, 0, 'the member dialog must have a reason field');
  assert.doesNotMatch(
    reasonField,
    /minLength/,
    'the member reason field must not enforce a minimum length',
  );
  assert.doesNotMatch(
    admin,
    /editReason\.trim\(\)\.length < 3/,
    'the member dialog must not block on a short reason',
  );
  assert.match(admin, /NO_REASON/, 'a blank reason is recorded as one that was not given');
  assert.match(
    admin,
    /USERNAME_PATTERN/,
    'the username rule is mirrored so the desk is told which part of it failed',
  );
});

test('shadcn primitives required by the dashboard shell exist', async () => {
  for (const primitive of ['animated-file-tree', 'avatar', 'badge', 'button', 'card', 'chart', 'command', 'connected-carousel', 'field', 'input', 'popover', 'radio-group', 'select', 'separator', 'skeleton', 'textarea', 'toast', 'tooltip', 'sheet', 'label', 'progress']) {
    assert.ok(await exists(`components/ui/${primitive}.tsx`), `components/ui/${primitive}.tsx must exist`);
  }
});

test('a session cookie is written with a lifetime, so a reader stays signed in', async () => {
  // The callback used to drop the options Supabase hands it, which turned the auth cookie into a
  // session cookie: no maxAge, gone the moment the browser closed. A reader was then silently
  // signed out on their next visit even though the refresh token had never lapsed.
  const callback = await readProjectFile('app/auth/callback/route.ts');
  assert.match(
    callback,
    /cookieStore\.set\(name, value, \{/,
    'the cookie options must survive the trip into cookies().set',
  );
  assert.match(callback, /maxAge: SESSION_MAX_AGE_SECONDS/, 'the auth cookie needs an explicit lifetime');
  assert.match(callback, /cookieOptions:/, 'the server client must pin its own cookie options');
  const supabase = await readProjectFile('lib/supabase.ts');
  assert.match(supabase, /SESSION_MAX_AGE_SECONDS/, 'the browser client must agree on the lifetime');
  assert.match(supabase, /isMissingSession/, 'a dropped connection must not read as a sign-out');
});

test('the spotlight marks issues and shows who solved them', async () => {
  const forum = await readProjectFile('components/forum/spotlight-forum.tsx');
  assert.match(forum, /mark_spotlight_issue/, 'marking goes through the audited RPC');
  assert.match(forum, /spotlight_resolution_media/, 'proof pictures are shown with the post');
  for (const status of ['open', 'in_progress', 'solved', 'invalid']) {
    assert.ok(forum.includes(status), `the ${status} issue state must be reachable`);
  }
  for (const kind of ['student_wing', 'volunteers', 'dean_office', 'hall_authority']) {
    assert.ok(forum.includes(kind), `${kind} must be offered as a solver`);
  }
  for (const slot of ['under_1h', '1_3d', 'over_1m']) {
    assert.ok(forum.includes(slot), `${slot} must be offered as a solve-time bucket`);
  }
  assert.match(forum, /role === "moderator"/, 'the desk can mark any issue, not only their own');
  assert.doesNotMatch(forum, /UUID/, 'no issue action may ask for a raw id');
});

test('spotlight accountability is public', async () => {
  const stats = await readProjectFile('components/statistics/spotlight-stats.tsx');
  assert.match(stats, /get_public_spotlight_stats/);
  assert.match(stats, /get_public_spotlight_solvers/);
  assert.match(stats, /false_count|invalid/, 'the false-issue count must be shown');
  for (const label of ['এই সপ্তাহ', 'এই মাস', 'এই বছর', 'সর্বকালের']) {
    assert.ok(stats.includes(label), `${label} window must be shown`);
  }
  const page = await readProjectFile('app/statistics/page.tsx');
  assert.match(page, /<SpotlightStats \/>/, 'the statistics page must render it');
});

test('a Spotlight issue has its own public page with its full history', async () => {
  const page = await readProjectFile('app/spotlight/[id]/page.tsx');
  assert.match(page, /spotlight_issue_events/, 'the page shows the append-only history');
  assert.match(page, /spotlight_resolution_media/, 'the page shows the proof gallery');
  assert.match(page, /solver_kind/, 'the page names who solved the issue');
  assert.match(page, /spotlightMediaUrlFor/, 'proof pictures resolve through the media Worker');
  assert.match(page, /notFound\(\)/, 'an unknown or malformed id must 404');
  assert.match(page, /generateMetadata/, 'the issue page must be shareable');
  assert.doesNotMatch(page, /actor_id/, 'the public page must not read the hidden marking account');
  // Every entry point must reach the page: the feed and the statistics both link to it.
  const forum = await readProjectFile('components/forum/spotlight-forum.tsx');
  assert.match(forum, /\/spotlight\/\$\{post\.id\}\//, 'a feed card links to its issue page');
  const stats = await readProjectFile('components/statistics/spotlight-stats.tsx');
  assert.match(stats, /\/spotlight\/\$\{issue\.id\}\//, 'a public decision links to its issue page');
});

test('submitting a story reports its outcome with a spinner and a toast', async () => {
  const writer = await readProjectFile('components/account/writer-form.tsx');
  assert.match(writer, /useToast/);
  assert.match(writer, /Loader2/);
  assert.match(writer, /animate-spin/, 'the submit button must show a loading animation');
  assert.match(writer, /toast\(\{/, 'each submission must raise a toast');
  assert.match(writer, /aria-busy/, 'the button must announce that it is busy');
  const toast = await readProjectFile('components/ui/toast.tsx');
  assert.match(toast, /export function ToastProvider/);
  assert.match(toast, /export function useToast/);
  const layout = await readProjectFile('app/layout.tsx');
  assert.match(layout, /ToastProvider/, 'the provider must be mounted once, at the root');
});

test('the member dashboard separates identity, news and spotlights', async () => {
  const dashboard = await readProjectFile('components/account/account-dashboard.tsx');
  for (const label of ['পরিচয়', 'আমার সংবাদ', 'আমার স্পটলাইট']) {
    assert.ok(dashboard.includes(label), `the ${label} tab must exist`);
  }
  assert.match(dashboard, /get_my_articles/, 'the news tab reads the member\'s own stories');
  assert.match(dashboard, /rejection_reason/, 'a rejected story must show the reason it was refused');
  assert.match(dashboard, /spotlight_posts/, 'the spotlight tab lists the member\'s own issues');
  assert.doesNotMatch(dashboard, /UUID/, 'no dashboard field may ask for a raw id');
});

test('the site mark ships with the bar and the footer', async () => {
  assert.ok(await exists('public/brand-icon.svg'), 'public/brand-icon.svg must exist');
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /\/brand-icon\.svg/, 'the bar must use the site mark');
});
