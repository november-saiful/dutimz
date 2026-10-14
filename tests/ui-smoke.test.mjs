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
// This stylesheet owns `.block` for the page container (1240px, centred, with the
// gutter as padding), so Tailwind's `block` utility is a landmine on any surface:
// it wins the class attribute and silently caps the element at the band's measure.
// A class *token* is what collides, so `pf-side-block` is fine and a bare `block`
// is not.
const usesBlockUtility = (line) =>
  /(?:^|[\s"'`{])block(?=[\s"'`}]|$)/.test(line);

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
  // A sitemap frozen at deploy time lists only what existed then, and crawlers trust it — so it is
  // neither built once nor rendered per request. It is cached and invalidated by the desk that
  // publishes the stories it lists (lib/revalidate.ts), with the window as its backstop.
  assert.doesNotMatch(
    sitemap,
    /force-dynamic/,
    'the sitemap is cached now: rendering it per request was one of the routes Cloudflare 1102-ed',
  );
  assert.match(sitemap, /export const revalidate = \d+/);
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
  // redesign: navigation is the design's pill bar fed by the real desks. The bar
  // ends in one menu — not a burger beside a separate account avatar — and that
  // panel carries the desks and the account together (`SiteMenu`).
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /className="topbar"/);
  assert.match(header, /className="logo"/);
  assert.match(header, /dutimz-text-logo\.svg/, 'the brand lockup leads the bar');
  assert.match(header, /pill\$\{active \? " active" : ""\}/, 'the desks are pills with a real active state');
  assert.match(header, /<SiteMenu/, 'the bar ends in the one menu');
  assert.match(header, /sections=\{sections\}/, 'and it draws the live desks, not a fixed list');
  assert.doesNotMatch(header, /className="burger"/, 'the second menu button is gone');
  const menu = await readProjectFile('components/dashboard/site-menu.tsx');
  assert.match(menu, /aria-label="মেনু"/);
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

test('the header account menu is the session menu with DUTIMZ routes', async () => {
  // The header must never show menu entries that go nowhere: there is no presence
  // system, no theming, and no premium tier, so those actions stay hidden and every
  // visible one maps to a real route.
  const menu = await readProjectFile('components/dashboard/site-menu.tsx');
  assert.match(menu, /hiddenActions/);
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /SiteMenu/);
  assert.match(header, /supabaseBrowser/);
  assert.match(header, /onAuthStateChange/);
  assert.match(header, /hiddenActions/);
  // Actions and destinations live in one shared table, so the menu and the
  // handler cannot drift apart.
  const table = await readProjectFile('lib/account-menu.ts');
  assert.match(header, /@\/lib\/account-menu/, 'the header must route through the shared table');
  assert.match(menu, /@\/lib\/account-menu/, 'the menu must read the shared table');
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
  const menu = await readProjectFile('components/dashboard/site-menu.tsx');
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');

  assert.match(menu, /isGuest/, 'the menu must distinguish a signed-out visitor');
  assert.doesNotMatch(
    menu,
    /guestExplore|guestInfo|MENU_ITEMS\.guest/,
    'the two-shape guest menu is gone',
  );
  assert.match(menu, /<SignInButton/, 'the Google button lives inside the menu');
  assert.match(menu, /isGuest && \(/, 'only the signed-out branch adds it');
  assert.doesNotMatch(menu, /href="\/auth\/sign-in"/, 'there is no sign-in page to link to');

  // Session-only rows stay visible in both states; a signed-out tap routes to
  // the header's Google action rather than to the row's own destination.
  assert.match(menu, /requiresSession/);
  assert.match(menu, /isGuest && item\.requiresSession \? "sign-in" : item\.action/);

  // The header always mounts the menu with the session it resolved, absent when
  // signed out — never a bare avatar that drops the visitor on a page they cannot
  // use, and never an empty panel: no session reads as the guest menu.
  assert.match(header, /user=\{menuUser\}/);
  assert.match(menu, /const isGuest = !user/);
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
  const menu = await readProjectFile('components/dashboard/site-menu.tsx');
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');

  const menuActions = [...menu.matchAll(/action:\s*"([^"]+)"/g)].map((m) => m[1]);
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
    menu,
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

  // A phone's bar has no room for the field beside the mark, the menu and the
  // search button, so it carries a button that raises the same form in the site's
  // own top sheet. The wide bar keeps the field it has room for, and neither width
  // wears both.
  assert.match(header, /className="search-toggle"/, 'the phone carries a search button');
  assert.match(header, /<SheetTrigger asChild>/, 'and it is the popup trigger');
  assert.match(header, /<SheetContent\s+side="top"/, 'the popup drops in from the top');
  assert.match(header, /searchInput\.current\?\.focus\(\)/, 'the popup hands its field the caret');
  assert.match(header, /setSearchOpen\(false\)/, 'and a search dismisses it');
  const css = await readProjectFile('app/globals.css');
  assert.match(css, /\.search-toggle \{\s*display: none;/, 'the button is desktop-invisible');
  const phoneCss = css.slice(
    css.indexOf('/* ============ RESPONSIVE'),
    css.indexOf('@media (max-width: 600px)'),
  );
  assert.match(phoneCss, /\.search \{\s*display: none;/, 'the inline field leaves the phone bar');
  assert.match(phoneCss, /\.search-toggle \{\s*display: grid;/, 'exactly where the button arrives');

  const route = await readProjectFile('app/api/search/route.ts');
  assert.match(route, /search_public_articles/);
  assert.match(route, /isDemoMode/);
  assert.match(route, /no-store/);
  assert.doesNotMatch(route, /service_role|SERVICE_ROLE|secret/i);
});

test('the designed lockup leads the top bar and the footer', async () => {
  // The brand is now one drawn file rather than a tile beside a typographic
  // "DUTIMZ": the bar and the footer both render `public/dutimz-text-logo.svg`,
  // so the mark and the wordmark cannot drift apart. The square tile stays the
  // tab icon, where a wordmark could not be read.
  assert.ok(await exists('public/dutimz-text-logo.svg'));
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /dutimz-text-logo\.svg/, 'the bar carries the lockup');
  assert.doesNotMatch(header, /<b>DUTIMZ<\/b>/, 'and not a mark with a typed wordmark');
  const footer = await readProjectFile('components/dashboard/site-footer.tsx');
  assert.match(footer, /dutimz-text-logo\.svg/, 'the footer repeats the same lockup');
  const css = await readProjectFile('app/globals.css');
  assert.match(css, /\.logo img \{\s*height: 24px;\s*width: auto;/, 'the lockup keeps its own proportion');
});

test('the phone search popup opens above the top bar it drops from', async () => {
  // The popup used to slide in at the sheet's own z-50 while the sticky top bar
  // sat at z-60, so the panel opened *behind* the bar: a phone reader tapped the
  // button and the field never appeared. Both the panel and its scrim now sit
  // above every bar the header owns, and the sheet primitive carries the scrim's
  // class through rather than hardcoding it.
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /overlayClassName="z-\[80\]"/, 'the popup lifts its own scrim');
  assert.match(header, /className="z-\[80\] gap-3/, 'and the panel with it');
  const sheet = await readProjectFile('components/ui/sheet.tsx');
  assert.match(sheet, /overlayClassName\?: string/, 'SheetContent accepts a scrim class');
  assert.match(sheet, /<SheetOverlay className=\{overlayClassName\} \/>/);
  const css = await readProjectFile('app/globals.css');
  assert.match(css, /\.topbar \{[\s\S]*?z-index: 60;/, 'the bar the popup must clear is at 60');
  // The menu is the header's other overlay and maps the stack above the bar: its
  // scrim at 100 and its panel at 110, with the search popup's 80 between them.
  // The phone's desks used to be a drawer at 70; they are rows in that panel now.
  assert.match(css, /\.menu-backdrop \{[\s\S]{0,120}?z-index: 100;/, 'the menu scrim clears the bar');
  assert.match(css, /\.menu-panel \{[\s\S]{0,200}?z-index: 110;/, 'and its panel sits over the scrim');
});

test('every accent is the brand purple, not the reference design\'s blue', async () => {
  // The palette is the brand's two colours — #5f2367 and #a370a0, both taken from
  // the logo — with the reference's greys nudged toward purple: links, primary
  // buttons, the focus ring, the current dock tab and the chart ramp all read as
  // DUTIMZ rather than as the Cryptonews template.
  const css = await readProjectFile('app/globals.css');
  assert.match(css, /--color-primary: #5f2367;/, 'primary is the brand purple');
  assert.match(css, /--color-ring: #5f2367;/, 'so is the focus ring');
  assert.match(css, /--blue: #5f2367;/, 'links and the current dock tab follow it');
  assert.match(css, /--purple2: #a370a0;/, 'the muted brand colour carries the soft accents');
  assert.doesNotMatch(css, /#4d7dc0|#8b7cf0|#b06ef2/i, 'none of the template blues survive');
  assert.match(css, /--chart-1: 292 47% 27%;/, 'and the chart ramp is drawn in the brand hue');
  const layout = await readProjectFile('app/layout.tsx');
  assert.match(layout, /content="#f7f5f8"/, 'the browser chrome takes the shell colour too');

  // Two components had grown their own accent: a selected topic in Tailwind's
  // emerald and the live-alert switch in the same green. Both are brand states,
  // not success states, so both now read from the palette. The emerald that
  // remains is the toast's success tone and the admin banner's amber warning,
  // which mean something rather than decorating.
  const topics = await readProjectFile('components/search/topic-selector.tsx');
  assert.match(topics, /isSelected\s*\n?\s*\? "border-primary bg-primary\/10/, 'a chosen topic is brand-coloured');
  assert.doesNotMatch(topics, /emerald/, 'and no longer emerald');
  const alerts = await readProjectFile('components/article/live-alert-toggle.tsx');
  assert.match(alerts, /enabled \? "bg-primary" : "bg-muted"/, 'the live-alert switch is brand-coloured too');
  assert.doesNotMatch(alerts, /emerald/);
});

test('a desk flag carries the desk\'s own mark, not a colour block', async () => {
  // The ported design marked a section with a gradient rectangle, which said
  // nothing and looked the same on every desk. A flag now draws the desk's own
  // icon — one table, keyed by the label, in the brand's colour — and every
  // surface renders it through that one component.
  for (const path of [
    'app/page.tsx',
    'app/news/[slug]/page.tsx',
    'components/dashboard/story-blocks.tsx',
  ]) {
    const source = await readProjectFile(path);
    assert.doesNotMatch(source, /className="flag"/, `${path} must render the desk flag through the Flag component`);
    assert.match(source, /@\/components\/dashboard\/flag/, `${path} must import it`);
  }
  const flag = await readProjectFile('components/dashboard/flag.tsx');
  assert.match(flag, /FLAG_ICONS\[label\.trim\(\)\] \?\? FALLBACK_ICON/, 'the mark follows the label, with a fallback for a desk the table has not met');
  assert.match(flag, /aria-hidden/, 'the mark is decoration: the label beside it is the text');
  assert.match(flag, /from "lucide-react"/, 'marks are bundled, never fetched at runtime');
  const css = await readProjectFile('app/globals.css');
  assert.doesNotMatch(css, /\.flag::before/, 'the colour block must not come back');
  assert.match(css, /\.flag-icon[\s\S]{0,120}color: var\(--flag-ink, var\(--purple\)\)/, 'the mark takes the brand colour');
  // Nothing wears a flag on top of a picture any more: the lead band is the
  // deck, whose cards carry their desk as a badge of their own.
  assert.doesNotMatch(css, /--flag-ink: #d7bcd4/, 'the on-photo tint is retired with the slider');
});

test('saved content moved out of the header into the account menu', async () => {
  // The top bar used to carry a bookmark button that opened a saved-reports
  // popover. Saved content is now an entry in the account menu instead, and the
  // popover component is gone.
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.doesNotMatch(header, /SavedPopover/, 'the header must not render a saved popover');
  assert.doesNotMatch(header, /Bookmark/, 'the bookmark button is gone');
  const menu = await readProjectFile('components/dashboard/site-menu.tsx');
  assert.match(menu, /সংরক্ষিত কনটেন্ট/);
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
  // The front page is the design's composition — the connected deck over the
  // week's reports, the recommended band under it, the latest rows and the two
  // carousels — and every slot is filled from the archive read. An approved
  // story still has to appear at once: the route is cached and the desk
  // invalidates it, rather than every reader's request paying for a render
  // (Cloudflare 1102).
  const page = await readProjectFile('app/page.tsx');
  assert.doesNotMatch(page, /force-dynamic/);
  assert.match(page, /export const revalidate = \d+/);
  assert.match(page, /<DutimzShell bare>/);
  assert.match(page, /aria-label="প্রধান প্রতিবেদন"/, 'the deck sits in the hero slot');
  assert.match(page, /<CalendlyCarousel items=\{deck\} autoPlayInterval=\{7000\} pauseOnHover \/>/);
  assert.match(page, /<Flag label="সপ্তাহের সেরা" \/>/, 'the hero keeps the design\'s flag');
  assert.match(page, /className="recommended"/, 'the recommended band follows the deck');
  assert.match(page, /aria-label="প্রস্তাবিত প্রতিবেদন"/);
  assert.match(page, /প্রস্তাবিত/);
  assert.match(page, /সর্বশেষ খবর/);
  assert.match(page, /পাঠকের পছন্দ/);
  assert.match(page, /মাসের সেরা/);
  assert.match(page, /<StoryCarousel/);
  // The deck itself is the design's connected carousel, dressed by the site:
  // the story's own art and the reader's way into the report on the card in
  // focus, a stop for the reader who asked their system for less motion, and no
  // frame loop repainting the deck sixty times a second.
  const deck = await readProjectFile('components/ui/connected-carousel.tsx');
  assert.match(deck, /aria-roledescription="carousel"/);
  assert.match(deck, /StoryArt/, "the cards wear the story's own picture");
  assert.match(deck, /<Link[\s\S]{0,400}item\.stat/, 'the card in focus links its own report');
  assert.match(deck, /prefers-reduced-motion: reduce/, 'the deck stands still when motion is unwelcome');
  assert.match(deck, /window\.setTimeout/, 'one wait per card, restarted per card');
  assert.doesNotMatch(deck, /requestAnimationFrame/, 'never a sixty-times-a-second re-render');
  // The registry's progress fill is gone on purpose: the dot row says where the
  // reader is and the timer turns the deck, with nothing painting the wait down.
  assert.doesNotMatch(deck, /animation|keyframes|bg-blue/, 'no countdown is painted on the dots');
  // This site's own stylesheet owns `.block` (the band's max-width and padding),
  // so Tailwind's `block` utility is a landmine here: on the deck's dot and on
  // its connecting notches it inflates the element to the band's 72px minimum and
  // drags the shape out of place. The utility is banned inside the deck.
  const classLines = deck.split('\n').filter((line) => line.includes('className'));
  assert.ok(
    classLines.every((line) => !usesBlockUtility(line)),
    'the deck never uses the Tailwind block utility',
  );
  assert.doesNotMatch(deck, /21st\.dev/, "never the registry demo's fixture art");
  const css = await readProjectFile('app/globals.css');
  assert.doesNotMatch(css, /@keyframes dutimz-carousel-progress/, 'and the fill is gone from the stylesheet too');
  assert.match(css, /\.flag-icon/, 'and the desk marks are the stylesheet\'s');
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
  // The image slider that briefly led this band is retired — component, styles
  // and all — and the reel stays gone with it. The connected deck is not
  // retired: it is the hero again, in the site's own dress.
  assert.doesNotMatch(page, /HeroSlider/);
  await assert.rejects(
    () => exists('components/dashboard/hero-slider.tsx'),
    'the retired image slider must not come back',
  );
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
  // The preview fixtures fall back to Unsplash art, which next.config allows. The
  // fixtures themselves now live in their own module — a client component reads
  // them, and `lib/stories.ts` reaches for the server-side Supabase client — so
  // the URLs are checked where they are and the re-export where the front page
  // imports them from.
  const stories = await readProjectFile('lib/stories.ts');
  assert.match(stories, /from "\.\/preview"/, 'the front page still imports the fixtures from here');
  const preview = await readProjectFile('lib/preview.ts');
  assert.match(preview, /images\.unsplash\.com/);
  assert.doesNotMatch(preview, /^import /m, 'the fixture module must import nothing: a browser reads it');
  const config = await readProjectFile('next.config.ts');
  assert.match(config, /images\.unsplash\.com/);

  const pkg = JSON.parse(await readProjectFile('package.json'));
  assert.ok(pkg.dependencies['framer-motion'], 'animated-file-tree still needs framer-motion');
  assert.ok(!pkg.dependencies.motion, "the reel's own motion package must be gone");
});

test('both profile pages are one editorial profile in the site\'s own purple', async () => {
  // `/u/<handle>/` and `/account/` are the same page in the reference design's
  // shape — a band, the identity over its foot, a hairline row of facts, a strip
  // of real numbers, report rows beside blocks — so they are built from one set
  // of pieces rather than two hand-rolled copies that drift, and one stylesheet
  // section owns every rule they need.
  const pieces = await readProjectFile('components/profile/profile-pieces.tsx');
  for (const piece of [
    'ProfileBand',
    'ProfileKicker',
    'ProfileMeta',
    'ProfileStats',
    'ProfileSectionHead',
    'ProfileEntry',
    'ProfileSideBlock',
    'ProfileTip',
  ]) {
    assert.match(
      pieces,
      new RegExp(`export function ${piece}\\b`),
      `${piece} must be one piece both pages share`,
    );
  }
  // The headline is the row's link, and a row's own button sits outside it: a
  // button inside an anchor is neither valid HTML nor reachable.
  assert.match(pieces, /href \? \(\s*<Link className="pf-title"/);
  assert.doesNotMatch(pieces, /<a[^>]*>[\s\S]{0,200}<button/);

  const publicProfile = await readProjectFile(
    'components/profile/public-profile.tsx',
  );
  assert.match(publicProfile, /@\/components\/profile\/profile-pieces/, 'the public page is built from the shared pieces');
  assert.match(publicProfile, /get_public_profile/, 'the read only returns what the member made public');
  assert.match(publicProfile, /count: "exact"/, 'the strip prints a real total, not the page of rows');
  assert.match(publicProfile, /StoryArt/, "a row wears the story's own picture");
  assert.match(publicProfile, /previewMember/, 'a build with no credentials shows the preview member');
  assert.match(
    publicProfile,
    /username !== previewMember\.username/,
    'and only that one handle — every other address still reads as missing',
  );
  assert.doesNotMatch(publicProfile, /@\/components\/ui\/card/, 'the profile is a page, not a card');

  const dashboard = await readProjectFile(
    'components/account/account-dashboard.tsx',
  );
  assert.match(dashboard, /@\/components\/profile\/profile-pieces/, 'the dashboard is built from the same pieces');
  for (const kept of [
    'get_my_articles',
    'get_my_wallet',
    'get_my_profile_completion',
    'spotlight_posts',
    'ContentEditDialog',
    'ProfileEditDialog',
    'PublicProfileSettings',
    'isMissingSession',
  ]) {
    assert.ok(dashboard.includes(kept), `the dashboard keeps ${kept}`);
  }
  // An edit from here is still a request the desk reviews, never a write.
  assert.doesNotMatch(dashboard, /\.update\(|\.insert\(|\.delete\(/);
  assert.match(dashboard, /previewMember/, 'the preview member stands in when there is no session');

  const css = await readProjectFile('app/globals.css');
  for (const rule of [
    '.pf-page {',
    '.pf-band {',
    '.pf-head {',
    '.pf-stats {',
    '.pf-layout {',
    '.pf-chips {',
    '.pf-entry-link {',
    '.pf-thumb {',
    '.pf-side-block {',
    '.pf-tip {',
    '.pf-status {',
  ]) {
    assert.ok(css.includes(rule), `globals.css must own ${rule}`);
  }
  // `pf-` and nothing else, for the reason the deck's own guard gives: this
  // stylesheet already owns `.block`, and a Tailwind utility that happens to
  // spell one of its names runs into it.
  const profileLines = [
    ...publicProfile.split('\n'),
    ...dashboard.split('\n'),
    ...pieces.split('\n'),
  ].filter((line) => line.includes('className'));
  assert.ok(
    profileLines.every((line) => !usesBlockUtility(line)),
    'no Tailwind block utility in the profile surfaces',
  );

  // Both pages draw themselves under the bare shell, and the fixture owns exactly
  // one handle, so the missing-profile state keeps its layout.
  const profilePage = await readProjectFile('app/u/[username]/page.tsx');
  assert.match(profilePage, /<DutimzShell bare>/);
  const accountPage = await readProjectFile('app/account/page.tsx');
  assert.match(accountPage, /<DutimzShell bare>/);
  const preview = await readProjectFile('lib/preview.ts');
  assert.match(preview, /username: "rafia_islam"/, 'the fixture answers to one handle');
});

test('the front page serves every slot from one archive read', async () => {
  // One read serves the whole front page: the hero slots, the rails and both
  // carousels are picked from the same newest-first list, and a short feed
  // cycles its own stories rather than leaving holes.
  const page = await readProjectFile('app/page.tsx');
  assert.match(page, /getLatestStories\(25\)/);
  const reads = page.match(/getLatestStories\(/g) ?? [];
  assert.equal(reads.length, 1, 'the front page must take one read, not one per slot');
  // Every band reads its own slice of that one list, in order: the deck takes
  // the first five, the recommended band the next five, and so on to the end.
  // A story printed twice on one page is what a shared slot would look like.
  for (const slots of [
    '[0, 1, 2, 3, 4]',
    '[6, 7, 8, 9]',
    '[10, 11, 12, 13, 14]',
    '[15, 16, 17, 18, 19]',
    '[20, 21, 22, 23, 24]',
  ]) {
    assert.ok(page.includes(slots), `the front page's slots must stay disjoint and ordered (missing ${slots})`);
  }
  assert.match(page, /const feature = pick\(items, 5\)/, 'the recommended band takes the slot after the deck');
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
  // One face, everywhere: Noto Serif Bengali, whose Latin subset also sets the
  // English copy, the numbers and the wordmark. The second Latin face that used to
  // lead the stack is gone rather than left to download unreached.
  assert.match(layout, /Noto_Serif_Bengali/, 'the site is set in Noto Serif Bengali');
  assert.match(layout, /--font-bengali/, 'its variable reaches the stylesheet');
  assert.doesNotMatch(
    layout,
    /import \{[^}]*\bInter\b[^}]*\} from "next\/font\/google"/,
    'and no second face is imported',
  );
  const css = await readProjectFile('app/globals.css');
  assert.match(css, /--font-ui: var\(--font-bengali\)/, 'and it leads the default stack');
  assert.doesNotMatch(css, /--font-inter/, 'the retired face is gone from the stack too');
  assert.match(css, /prefers-reduced-motion: reduce/, 'a global reduced-motion reset');
  // Glass is a dose-capped accent: the sticky bars may blur — the top bar, the
  // article bar, and the phone dock's floating card — and so may the scrim behind
  // the menu. Four rules and no more: a fifth means a surface grew its own glass
  // instead of sharing. The menu panel is deliberately not one of them: it holds a
  // page's worth of the reader's own text, so it paints solid paper over the dimmed
  // page rather than showing it through itself.
  const blur = css.match(/^\s*backdrop-filter: blur/gm) ?? [];
  assert.ok(blur.length <= 4, 'backdrop blur belongs to the sticky bars and the menu scrim');
  const panelRule = css.slice(css.indexOf('.menu-panel {'), css.indexOf('.menu-panel[data-state="closed"]'));
  assert.doesNotMatch(panelRule, /backdrop-filter/, 'the menu panel is solid paper, not glass');
  assert.match(panelRule, /background: #ffffff;/, 'and it paints its own surface');
  assert.match(css, /\.menu-backdrop \{[\s\S]{0,120}?backdrop-filter: blur/, 'with a blurred scrim behind it');
  const page = await readProjectFile('app/page.tsx');
  assert.doesNotMatch(page, /requestAnimationFrame/, 'no frame loop re-renders the page');
  // recharts stays out of the initial bundle: the homepage imports no chart,
  // and the lazy wrapper still suspends what it loads to the client.
  assert.doesNotMatch(page, /recharts/);
  const lazy = await readProjectFile('components/dashboard/throughput-chart-lazy.tsx');
  assert.match(lazy, /next\/dynamic/);
  assert.match(lazy, /ssr: false/);
  const menu = await readProjectFile('components/dashboard/site-menu.tsx');
  assert.doesNotMatch(menu, /@iconify\/react/, 'no runtime icon fetch');
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
  assert.match(gallery, /uploadImage\(file, scope\)/, 'the gallery uploads through the one shared contract');
  assert.match(gallery, /HEIC/);
  const upload = await readProjectFile('lib/media-upload.ts');
  assert.match(upload, /article: "\/upload"/, 'the news endpoint is declared once, for every uploader');
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

test('the phone menu shows the same desks and the account behind one button', async () => {
  // The bar hands its desks to the menu: the same live sections the wide bar
  // shows as pills, listed in the panel the right-hand button opens, so a reader
  // on a phone loses no destination — and the account is in that same panel, not
  // behind a second control beside it.
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /<SiteMenu/, 'the bar has one menu');
  assert.doesNotMatch(header, /className="burger"/, 'and no second disclosure beside it');
  const menu = await readProjectFile('components/dashboard/site-menu.tsx');
  assert.match(menu, /aria-label="মেনু"/);
  assert.match(menu, /sections\.map/, 'every live desk is a row in the menu');
  assert.match(menu, /aria-current=\{current \? "page" : undefined\}/, 'the desk the reader is on says so');
  const css = await readProjectFile('app/globals.css');
  const phone = css.slice(
    css.indexOf('/* ============ RESPONSIVE'),
    css.indexOf('@media (max-width: 600px)'),
  );
  assert.match(phone, /\.nav \{\s*display: none;/, 'the pills leave the phone bar for the panel');
  // The panel opens under the bar but takes only its rows' own space: it must
  // not stretch to the fold on a phone, and caps itself with an internal scroll
  // when the rows outgrow the screen.
  assert.match(
    phone,
    /\.menu-panel \{[\s\S]*?top: calc\(var\(--topbar\) \+ 10px\)/,
    'and the panel opens under the bar it opened from',
  );
  assert.match(
    phone,
    /\.menu-panel \{[\s\S]*?bottom: auto;/,
    'and it hugs its content instead of stretching full-bleed',
  );
  assert.match(
    phone,
    /\.menu-panel \{[\s\S]*?max-height: calc\(100dvh - var\(--topbar\) - 20px\)/,
    'and it caps itself at the screen rather than running past the fold',
  );
  const shell = await readProjectFile('components/dashboard/dutimz-shell.tsx');
  assert.doesNotMatch(shell, /MobileBottomNav/, 'the retired phone dock stays gone');
});

test('the phone dock carries the four destinations plus a create action, and only on a phone', async () => {
  // A phone gets a floating dock over the foot of the page: four destinations
  // plus a central create action, drawn from the reference deck's morphing tab
  // bar. It is a different surface from the retired rail dock — the menu still
  // holds every desk including search — and only these live on it.
  const dock = await readProjectFile('components/dashboard/mobile-dock.tsx');
  assert.match(dock, /^"use client";/m, 'the dock is the island that reads the address');
  assert.match(dock, /usePathname/, 'the current tab follows the address');
  assert.match(dock, /aria-current=\{isCurrent \? "page" : undefined\}/, 'the current tab says so');
  assert.match(dock, /aria-label="প্রধান নেভিগেশন"/);
  const shell = await readProjectFile('components/dashboard/dutimz-shell.tsx');
  assert.match(shell, /<MobileDock \/>/, 'every page draws the dock');

  // The four entries, each on the address the rest of the site already publishes.
  for (const [key, href] of [
    ['home', '"/"'],
    ['flipps', '"/flipps/"'],
    ['spotlight', '"/spotlight/"'],
    ['account', '"/account/"'],
  ]) {
    assert.match(
      dock,
      new RegExp(`key: "${key}",\\s*\\n\\s*href: ${href.replaceAll('/', '\\/')},`),
      `the dock must carry ${key} to ${href}`,
    );
  }
  assert.doesNotMatch(dock, /key: "search"/, 'search lives in the menu, not the dock');
  assert.match(dock, /data-dock="create"/, 'the dock carries a central create action');
  assert.match(dock, /aria-haspopup="dialog"/, 'the create action opens a dialog');
  assert.match(dock, /\/account\/write\//, 'the create dialog offers news writing');
  assert.match(dock, /নিউজ প্রকাশ করুন/, 'the news option is labelled');
  assert.match(dock, /ইস্যু প্রকাশ করুন/, 'the issue option is labelled');

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
  // desks to the menu, and it reserves the room it floats over.
  assert.match(phone, /@media \(max-width: 860px\)/, 'the dock is a phone surface');
  assert.match(phone, /visibility: visible/, 'it reveals itself at the menu breakpoint');
  assert.match(phone, /padding-bottom: var\(--dock\)/, 'the page reserves the dock its room');
  const reels = await readProjectFile('components/flipps/flipps-reels.tsx');
  assert.match(
    reels,
    /100svh-var\(--topbar\)-var\(--dock\)-1\.5rem\)/,
    'the reel deck ends above the dock instead of under it',
  );
});

test('the phone dock marks the current tab with a liquid drop, not a sliding pill', async () => {
  // The indicator is the reference deck's metaball, carried to the web: two blobs
  // chasing the tab the reader chose, both inside one inline SVG goo filter, so
  // the lagging pair stretches across the gap as a single drop and settles back
  // into a pill. The words stay outside that filter — a blur over them would make
  // the dock unreadable — which is why the row is a layer of its own.
  const dock = await readProjectFile('components/dashboard/mobile-dock.tsx');
  // The physics are the stylesheet's, so the shell pulls no animation library for
  // a surface every page draws.
  assert.doesNotMatch(dock, /framer-motion|motion\/react/, 'the shell pulls no animation library for the dock');
  assert.doesNotMatch(dock, /dock-tint/, 'the sliding accent tint is gone');

  // Two blobs, and the goo that merges them: blur the shapes, then push the
  // blurred alpha back to a hard edge, which is what bridges the gap between them.
  assert.equal(
    (dock.match(/className="dock-blob dock-(lead|trail)"/g) ?? []).length,
    2,
    'a drop and its tail, on their own curves',
  );
  assert.match(dock, /feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" \/>/);
  assert.match(dock, /feColorMatrix/);
  assert.match(dock, /0 0 0 18 -7/, 'the alpha contrast that makes the merge hard-edged');
  assert.ok(
    dock.indexOf('className="dock-goo"') < dock.indexOf('className="dock-row"'),
    'the filter layer comes first, so the words are never blurred with it',
  );

  // The geometry is read from the row: the tabs are content-sized flex children
  // that redistribute as one of them opens, so which pixels the current one
  // occupies is the browser's answer, and the liquid follows it frame by frame.
  assert.match(dock, /ResizeObserver/, 'the drop follows the row while it settles');
  assert.match(dock, /\.dock-tab\[aria-current="page"\]/, 'it is read from the tab the reader is on');
  assert.match(dock, /getBoundingClientRect/, 'measured, not assumed');
  assert.match(dock, /useLayoutEffect/, 'the first placement lands before the first paint');
  assert.match(dock, /data-placed=\{placed \? "" : undefined\}/, 'and only then does the liquid start moving');

  const css = await readProjectFile('app/globals.css');
  // The physics are two curves on the stylesheet, fitted frame by frame to the
  // spring pair the reference effect runs (400/30 leading, 200/20 trailing): a
  // stiff snap and a looser tail. A curve is a token here, like the dock's morph
  // curve, and the tail is the slower of the two — which is the stretch.
  assert.match(css, /--dock-lead-ease: cubic-bezier\(0\.27, 0\.22, 0\.21, 1\.24\);/, 'the drop snaps');
  assert.match(css, /--dock-trail-ease: cubic-bezier\(0\.47, 0\.25, 0\.35, 1\.27\);/, 'and the tail trails');
  assert.match(
    css,
    /transition-duration: 0\.01ms !important/,
    'and needs no opt-in: the site\'s one reduced-motion reset collapses its durations like every transition',
  );
  const phone = css.slice(css.indexOf('.dock {'), css.indexOf('/* ============ RESPONSIVE'));
  assert.match(phone, /\.dock-goo \{/, 'the liquid layer has a surface of its own');
  assert.match(phone, /filter: url\(#dock-goo\)/, 'and points it at the inline SVG');
  assert.match(phone, /\.dock-goo\[data-hidden\]/, 'with nothing marked there is nothing drawn');
  assert.match(phone, /\.dock-row \{[\s\S]*?z-index: 1;/, 'the words sit above it');
  assert.match(phone, /\.dock-goo\[data-placed\] \.dock-lead \{[\s\S]*?transform 0\.32s var\(--dock-lead-ease\)/, 'the drop moves on its own curve');
  assert.match(phone, /\.dock-goo\[data-placed\] \.dock-trail \{[\s\S]*?transform 0\.52s var\(--dock-trail-ease\)/, 'the tail on the slower one');
  assert.match(phone, /width 0\.32s var\(--dock-lead-ease\)/, 'the width follows the position, on the drop');
  assert.match(phone, /width 0\.52s var\(--dock-trail-ease\)/, 'and on its tail');
  assert.match(phone, /\.dock-blob \{[\s\S]*?background: var\(--blue\)/, 'the drop is the brand colour');
  assert.match(phone, /\.dock-tab\.current \{\r?\n  color: #fff;/, 'and the open tab reads on it in paper');
  assert.doesNotMatch(phone, /\.dock-tint/, 'the sliding tint is gone from the surface too');
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
  // only client that shares the app's session, and `lib/media-upload.ts` is the one module that
  // sends an upload — a second caller with its own fetch would be a second place to get this
  // wrong, which is why the gallery is checked for sending nothing itself.
  const uploader = await readProjectFile('lib/media-upload.ts');
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
  const gallery = await readProjectFile('components/account/gallery-uploader.tsx');
  assert.doesNotMatch(gallery, /fetch\(/, 'the gallery sends nothing itself: one module owns the request');
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
  const uploader = await readProjectFile('lib/media-upload.ts');
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

test('desk tools live on the account page, not the public profile', async () => {
  const publicProfile = await readProjectFile('components/profile/public-profile.tsx');
  assert.doesNotMatch(publicProfile, /প্রতিবেদন লিখুন/, 'the public page must not offer the newsroom composer');
  assert.doesNotMatch(publicProfile, /প্রতিবেদন পাঠান/, 'the public page must not carry a story-submission call to action');
  assert.doesNotMatch(publicProfile, /স্পটলাইট দেখুন/, 'the public page must not link out to Spotlight');
  assert.doesNotMatch(publicProfile, /href="\/account\/write\/"/, 'the public page must not carry a newsroom destination');
  assert.doesNotMatch(publicProfile, /href="\/spotlight\/"/, 'the public page must not carry a Spotlight destination');

  const dashboard = await readProjectFile('components/account/account-dashboard.tsx');
  assert.match(dashboard, /href: "\/account\/moderation\/"/, 'moderation must be reachable from the account page');
  assert.match(dashboard, /show: role === "moderator" \|\| role === "admin"/, 'moderation must stay limited to the desk');
  assert.match(dashboard, /href: "\/account\/admin\/"/, 'the admin panel must be reachable from the account page');
  assert.match(dashboard, /show: role === "admin"/, 'the admin panel must stay limited to administrators');
});

test('campus and university are one desk', async () => {
  // The two desks covered the same beat, so they merged under the campus name:
  // one entry in the configured list, one topic, one flag, and every published
  // article moved by migration rather than left behind on a retired slug.
  const site = await readProjectFile('lib/site.ts');
  assert.match(site, /\{ label: "ক্যাম্পাস", slug: "campus" \}/, 'campus stays the merged desk');
  assert.doesNotMatch(site, /"university"/, 'the retired slug leaves the configured list');
  const topics = await readProjectFile('components/search/topic-selector.tsx');
  assert.doesNotMatch(topics, /"university"/, 'search offers one campus topic, not two desks');
  const flag = await readProjectFile('components/dashboard/flag.tsx');
  assert.doesNotMatch(flag, /বিশ্ববিদ্যালয়/, 'no desk mark points at the retired name');
  const preview = await readProjectFile('lib/preview.ts');
  assert.doesNotMatch(preview, /categorySlug: "university"/, 'the preview fixture files under campus too');
  const migration = await readProjectFile('supabase/migrations/202610140002_merge_campus_university.sql');
  assert.match(migration, /update public\.articles[\s\S]*?slug = 'campus'[\s\S]*?slug = 'university'/, 'published articles move to campus');
  assert.match(migration, /delete from public\.categories where slug = 'university'/, 'the retired row is removed');
  assert.match(migration, /begin;/, 'the merge is atomic');
  assert.ok(migration.trimEnd().endsWith('commit;'), 'the merge commits as one transaction');
  const page = await readProjectFile('app/category/[slug]/page.tsx');
  assert.match(page, /permanentRedirect\("\/category\/campus\/"\)/, 'the old address redirects instead of rendering empty');
});

test('the site mark ships with the bar and the footer', async () => {
  assert.ok(await exists('public/brand-icon.svg'), 'public/brand-icon.svg must exist');
  assert.ok(await exists('public/dutimz-text-logo.svg'), 'the lockup the bar draws from must exist');
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.match(header, /\/dutimz-text-logo\.svg/, 'the bar must use the designed lockup');
  const layout = await readProjectFile('app/layout.tsx');
  assert.match(layout, /apple-touch-icon" href="\/brand-icon\.svg"/, 'the square tile is still the app icon');
});

test('one renderer draws every piece of authored text', async () => {
  // A body is Markdown now, and the same component has to draw it on the published page, in the
  // pending submission a reviewer reads, in the desk's preview and in the composer's own preview.
  // Otherwise a writer is shown one thing and a reader gets another.
  assert.ok(await exists('components/ui/rich-text-content.tsx'), 'the shared renderer must exist');
  const renderer = await readProjectFile('components/ui/rich-text-content.tsx');
  assert.match(renderer, /from "react-markdown"/, 'the renderer parses Markdown');
  assert.match(renderer, /remark-gfm/, 'GFM tables and lists are part of the format');
  assert.match(renderer, /remark-breaks/, 'a single newline still breaks a line, as it always did');
  assert.match(renderer, /mediaIdAt/, 'only a reference to our own uploaded media resolves');
  assert.doesNotMatch(renderer, /dangerouslySetInnerHTML/, 'authored text is never injected as HTML');
  assert.doesNotMatch(renderer, /rehypePlugins/, 'no HTML pass-through plugin is configured');

  for (const surface of [
    'app/news/[slug]/page.tsx',
    'app/spotlight/[id]/page.tsx',
    'components/forum/spotlight-forum.tsx',
    'components/article/pending-article.tsx',
    'components/account/moderation-queue.tsx',
    'components/account/admin-articles.tsx',
    'components/account/pending-edits.tsx',
  ]) {
    const source = await readProjectFile(surface);
    assert.match(source, /RichTextContent/, `${surface} must draw authored text with the shared renderer`);
    assert.doesNotMatch(source, /split\(\/\n\{2,\}\/\)/, `${surface} must not hand-split a Markdown body`);
  }
});

test('an inline picture is not repeated in the gallery and is fetched with a token in previews', async () => {
  // The body already places the picture; printing it again in ছবির গ্যালারি is the same photo twice.
  for (const surface of ['app/news/[slug]/page.tsx', 'app/spotlight/[id]/page.tsx']) {
    assert.match(
      await readProjectFile(surface),
      /inlineMediaIds/,
      `${surface} must exclude a picture the text already places`,
    );
  }
  // A preview shows text that is not public yet, so its pictures need the reader's own token: the
  // media host refuses an unpublished story's image to a plain <img>.
  for (const surface of [
    'components/article/pending-article.tsx',
    'components/account/admin-articles.tsx',
    'components/account/moderation-queue.tsx',
  ]) {
    assert.match(
      await readProjectFile(surface),
      /Image=\{AuthedMediaImage\}/,
      `${surface} must fetch private pictures with the reader's token`,
    );
  }
});

test('the composer keeps pasted formatting and can place a picture between paragraphs', async () => {
  const editor = await readProjectFile('components/ui/rich-text-editor.tsx');
  // Turndown is loaded on the first formatted paste, never at module scope: the same component is
  // pre-rendered on the server, where its browser build has no DOM to parse with.
  assert.match(editor, /import\("turndown"\)/, 'pasted HTML is converted to Markdown');
  assert.match(editor, /import\("turndown-plugin-gfm"\)/, 'a pasted table arrives as a table');
  assert.match(editor, /getData\("text\/html"\)/, 'the rich flavour of the clipboard is what is read');
  assert.match(editor, /insertAtCaret/, 'a picture can be placed at the caret');
  assert.doesNotMatch(editor, /dangerouslySetInnerHTML/, 'the composer never injects HTML');

  const uploader = await readProjectFile('components/account/gallery-uploader.tsx');
  assert.match(uploader, /onInsert/, 'an uploaded picture can be inserted into the text');
  for (const surface of [
    'components/account/writer-form.tsx',
    'components/forum/spotlight-forum.tsx',
  ]) {
    const source = await readProjectFile(surface);
    assert.match(source, /RichTextEditor/, `${surface} must author Markdown, not plain text`);
    assert.match(source, /onInsert/, `${surface} must wire the insert-into-text action`);
  }
});

test('a correction to live writing waits for the moderation desk', async () => {
  const page = await readProjectFile('app/account/moderation/page.tsx');
  assert.match(page, /ModerationQueue/, 'pending submissions stay where they were');
  assert.match(page, /PendingEdits/, 'awaiting editions are a section of their own');

  const pending = await readProjectFile('components/account/pending-edits.tsx');
  for (const fn of ['moderate_article_edit', 'moderate_spotlight_edit']) {
    assert.ok(pending.includes(fn), `${fn} must be reachable from the desk`);
  }
  assert.match(pending, /"approve"/, 'approval sends the word the RPC expects');
  assert.match(pending, /"reject"/, 'refusal sends the word the RPC expects');
  assert.match(pending, /article_edit_requests/, 'the story queue is read from the requests table');
  assert.match(pending, /spotlight_edit_requests/, 'the Spotlight queue is read from the requests table');

  const dialog = await readProjectFile('components/account/content-edit-dialog.tsx');
  for (const fn of ['submit_article_edit', 'submit_spotlight_edit']) {
    assert.ok(dialog.includes(fn), `${fn} must be how an author asks`);
  }
  const dashboard = await readProjectFile('components/account/account-dashboard.tsx');
  assert.match(dashboard, /ContentEditDialog/, "the member's own story must offer a correction");
  assert.match(dashboard, /article_edit_requests/, 'a waiting correction must be visible on the row');
});

test('the rich text migrations are atomic and share one reference extractor', async () => {
  const files = [
    'supabase/migrations/202610130001_article_rich_text.sql',
    'supabase/migrations/202610130002_spotlight_rich_text.sql',
    'supabase/migrations/202610130003_pending_content_edits.sql',
  ];
  let definitions = 0;
  for (const file of files) {
    const sql = (await readProjectFile(file)).trim();
    assert.ok(sql.startsWith('--'), `${file} must explain why it exists`);
    assert.ok(sql.includes('begin;'), `${file} must open a transaction`);
    assert.ok(sql.endsWith('commit;'), `${file} must be atomic`);
    // Definitions only: each migration also re-states the function's `revoke`, and re-revoking an
    // ACL is how this repo keeps every touched function's access written down in one place.
    definitions += (sql.match(/create or replace function public\.body_media_ids/g) ?? []).length;
  }
  // Two definitions would mean one silently replacing the other.
  assert.equal(definitions, 1, 'the reference extractor is defined exactly once');
  const first = await readProjectFile(files[0]);
  assert.match(first, /body_media_ids\(p_body text, p_base text\)/, 'the shared signature is fixed');
  assert.match(first, /revoke all on function public\.body_media_ids/, 'no client resolves references itself');
  // The one rule that had to learn about Markdown: the summary a reader sees must carry no markup.
  assert.match(first, /create or replace function public\.derive_excerpt/, 'the summary still derives from the body');
  assert.match(first, /regexp_replace\(stripped,/, 'the body is stripped of markup before the summary is cut');
  // A picture placed in the body is only servable because it becomes an attachment row.
  assert.match(first, /insert into public\.article_media/, 'the body references become attachment rows');
  assert.match(first, /is_gallery boolean not null default true/, 'pre-existing attachment rows remain galleries');
  assert.match(first, /is_inline boolean not null default false/, 'inline placement is tracked separately');
  assert.match(first, /delete from public\.article_media am\s+where am\.article_id = p_article_id and not am\.is_gallery/, 'reconciliation removes inline-only rows and retains galleries');
  assert.match(first, /where am\.article_id = p_article_id and am\.is_inline/, 'reconciliation clears the old inline state before applying the new body');
  const second = await readProjectFile(files[1]);
  assert.match(second, /is_gallery boolean not null default true/, 'Spotlight tracks gallery attachments separately');
  assert.match(second, /pm\.media_id::text = any \(coalesce\(public\.body_media_ids/, 'gallery images referenced by the body retain the inline flag without a second row');
  const third = await readProjectFile(files[2]);
  assert.match(third, /update_own_article/, 'the old self-edit path is re-pointed, not left able to publish');
  assert.match(third, /submit_article_edit/, 'an author asks through a request');
  assert.match(third, /moderate_article_edit/, 'the desk judges through an audited RPC');
  assert.match(third, /delete from public\.article_media am\s+where am\.article_id = request\.article_id and not am\.is_gallery/, 'approval removes only inline-only attachments and retains galleries');
  assert.match(third, /where am\.article_id = request\.article_id and am\.is_inline/, 'approval resets prior inline state before reconciling the proposal');
});

test('a profile link previews as the member\'s own card, not the site banner', async () => {
  const card = await readProjectFile('app/u/[username]/opengraph-image.tsx');
  assert.match(card, /import \{ ImageResponse \} from "next\/og"/, 'the card is drawn, not linked');
  assert.match(card, /export const size = \{ width: 1200, height: 630 \}/, 'the large-image dimensions');
  assert.match(card, /export const contentType = "image\/png"/);
  assert.match(card, /ogProfile\(handle\)/, 'the card asks who the handle is');
  assert.match(card, /ogFonts\(\)/, 'Satori only draws Bengali with the TTFs handed to it');
  const og = await readProjectFile('lib/og-card.ts');
  assert.match(og, /export const BAND_GRADIENT/, 'the card reuses the page\'s band rather than inventing a picture');
  // The card and the page must draw the same band, so the gradient the module holds is
  // checked stop for stop against the one the stylesheet paints.
  const stylesheet = await readProjectFile('app/globals.css');
  const band = stylesheet.slice(stylesheet.indexOf('.pf-band {'), stylesheet.indexOf('.pf-band::after'));
  const stops = [...og.match(/BAND_GRADIENT =[\s\S]*?"([^"]+)"/)[1].matchAll(/#[0-9a-f]{6}/g)].map(([hex]) => hex);
  assert.equal(stops.length, 4, 'the band still has its four stops');
  for (const stop of stops) {
    assert.ok(band.includes(stop), `the stylesheet's band still uses ${stop}`);
  }
  // The eyebrow introduces the member by the desk's role, not as an anonymous
  // "member": the same word the page uses, from the same table.
  assert.match(card, /const eyebrow = profile \? `DUTIMZ \$\{roleTitle\(profile\.role\)\}` : "DUTIMZ"/, 'the card names the role');
  const site = await readProjectFile('lib/site.ts');
  assert.match(site, /reporter: "Reporter"/, 'the role titles are named once for the card and the page');
  assert.match(site, /reader: "Member"/, 'a reader is a member, not a rank they do not hold');
  assert.match(og, /role: asString\(row\.role\)/, 'the role comes from the same public read as the name');
  const publicPage = await readProjectFile('components/profile/public-profile.tsx');
  assert.match(publicPage, /<ProfileKicker>\{`DUTIMZ \$\{roleTitle\(profile\.role\)\}`\}<\/ProfileKicker>/, 'the page introduces the member the way its card does');
  const images = await readProjectFile('supabase/migrations/202610140001_profile_images.sql');
  assert.match(images, /from public\.user_roles r where r\.user_id = profile\.id/, 'the role is read through the public door, and user_roles stays closed');
  assert.match(og, /noto-serif-bengali-\$\{weight\}\.ttf/, 'the card ships its own TTF subsets');
  assert.ok(await exists('public/fonts/noto-serif-bengali-400.ttf'));
  assert.ok(await exists('public/fonts/noto-serif-bengali-700.ttf'));
  // The root layout sets `twitter.images`, which keeps winning over a generated one: a
  // route that does not answer in that namespace itself previews as the banner on X.
  const twitter = await readProjectFile('app/u/[username]/twitter-image.tsx');
  assert.match(twitter, /export \{ alt, size, contentType, default \} from "\.\/opengraph-image"/, 'one drawing answers both scrapers');
});

test('every member uploads their own face and banner from the profile editor', async () => {
  const dialog = await readProjectFile('components/profile/profile-edit-dialog.tsx');
  assert.match(dialog, /type Images = \{ avatar_url: string \| null; cover_url: string \| null \}/);
  assert.match(dialog, /onPick=\{\(file\) => void pickImage\("avatar_url", file\)\}/, 'the face is chosen in the editor');
  assert.match(dialog, /onPick=\{\(file\) => void pickImage\("cover_url", file\)\}/, 'so is the banner');
  assert.match(dialog, /onRemove=\{\(\) => void saveImage\("cover_url", null\)\}/, 'and a banner can be taken down again');
  assert.match(dialog, /uploadImage\(file, "profile"\)/, 'both go through the profile scope of the media Worker');
  // Where a picture is written: the member's own row, one column at a time.
  assert.match(dialog, /\.from\("profiles"\)[\s\S]*?\.update\(\{ \[column\]: url \}\)/);
  const upload = await readProjectFile('lib/media-upload.ts');
  assert.match(upload, /profile: "\/profile\/upload"/);
  const worker = await readProjectFile('worker/src/index.ts');
  assert.match(worker, /profile: \{ table: 'profile_media_assets', prefix: 'profiles'/, 'profile media is its own scope, not a news asset');
  assert.match(worker, /url\.pathname === '\/profile\/upload'/, 'this scope carries no role gate: every signed-in member has a face');
  // The two band pages read the banner with the rest of the identity, and draw it into
  // the band rather than pasting it over one.
  const dashboard = await readProjectFile('components/account/account-dashboard.tsx');
  assert.match(dashboard, /select\("username,display_name,avatar_url,cover_url"\)/);
  const pieces = await readProjectFile('components/profile/profile-pieces.tsx');
  assert.match(pieces, /className="pf-band-cover"/, 'the band draws the member\'s own cover');
  assert.match(stylesheetBandCover(await readProjectFile('app/globals.css')), /object-fit: cover;/, 'a cover fills the band instead of stretching');
  // The columns, the gate and the public read the two pictures need.
  const migration = await readProjectFile('supabase/migrations/202610140001_profile_images.sql');
  assert.match(migration, /add column cover_url text/);
  assert.match(migration, /grant update \(cover_url\) on public\.profiles to authenticated/, 'the member owns their own banner');
  assert.match(migration, /create table public\.profile_media_assets/);
  assert.match(migration, /revoke all on public\.profile_media_assets from anon, authenticated/, 'the object keys stay server-side');
  assert.match(migration, /create or replace function public\.get_profile_media/);
  assert.match(migration, /grant execute on function public\.get_profile_media\(uuid\) to anon, authenticated/, 'a picture is public identity, even signed out');
  assert.match(migration, /profile\.cover_url,/, 'the public read hands the banner out with the identity');
});

test('the share card draws both scripts from its own font', async () => {
  // The renderer behind `ImageResponse` silently asks Google for any glyph the fonts it was
  // handed do not have, so a font that covers only one script still produces a card — from a
  // third party, inside every preview a scraper makes. This reads the shipped cmap instead:
  // the eyebrow is Latin ("DUTIMZ Reporter") and a member's name is Bengali, so both have to
  // be in the bytes the deployment carries.
  for (const weight of [400, 700]) {
    const font = await readFile(
      new URL(`../public/fonts/noto-serif-bengali-${weight}.ttf`, import.meta.url),
    );
    const glyph = cmapReader(font);
    const probes = [
      ['Latin', 0x41],
      ['the Bengali ka', 0x995],
      ['the o-kar every second Bengali word carries', 0x9cb],
      ['the i-kar', 0x9bf],
      ['the conjunct joiner', 0x9cd],
    ];
    for (const [label, codepoint] of probes) {
      assert.ok(
        glyph(codepoint) > 0,
        `noto-serif-bengali-${weight}.ttf cannot draw ${label} (U+${codepoint.toString(16).toUpperCase()})`,
      );
    }
  }
});

/**
 * A minimal cmap reader: the glyph id a codepoint maps to, or 0. Enough to prove a font
 * carries a script without shipping a font library for one assertion.
 */
function cmapReader(font) {
  const tableCount = font.readUInt16BE(4);
  let cmap = 0;
  for (let i = 0; i < tableCount; i++) {
    const entry = 12 + i * 16;
    if (font.toString('ascii', entry, entry + 4) === 'cmap') {
      cmap = font.readUInt32BE(entry + 8);
    }
  }
  return (codepoint) => {
    const subtables = font.readUInt16BE(cmap + 2);
    for (let i = 0; i < subtables; i++) {
      const record = cmap + 4 + i * 8;
      const platform = font.readUInt16BE(record);
      if (platform !== 0 && platform !== 3) continue;
      const offset = cmap + font.readUInt32BE(record + 4);
      const format = font.readUInt16BE(offset);
      if (format === 12) {
        const groups = font.readUInt32BE(offset + 12);
        for (let g = 0; g < groups; g++) {
          const group = offset + 16 + g * 12;
          const start = font.readUInt32BE(group);
          const end = font.readUInt32BE(group + 4);
          if (codepoint >= start && codepoint <= end) {
            return font.readUInt32BE(group + 8) + (codepoint - start);
          }
        }
      } else if (format === 4) {
        const segments = font.readUInt16BE(offset + 6);
        const ends = offset + 14;
        const starts = ends + segments + 2;
        const deltas = starts + segments;
        const ranges = deltas + segments;
        for (let s = 0; s * 2 < segments; s++) {
          const start = font.readUInt16BE(starts + s * 2);
          const end = font.readUInt16BE(ends + s * 2);
          if (codepoint < start || codepoint > end) continue;
          const delta = font.readInt16BE(deltas + s * 2);
          const range = font.readUInt16BE(ranges + s * 2);
          if (range === 0) return (codepoint + delta) & 0xffff;
          const at = ranges + s * 2 + range + (codepoint - start) * 2;
          const id = font.readUInt16BE(at);
          return id === 0 ? 0 : (id + delta) & 0xffff;
        }
      }
    }
    return 0;
  };
}

/** The `.pf-band-cover` rule, so the assertion cannot be satisfied by another block. */
function stylesheetBandCover(css) {
  const start = css.indexOf('.pf-band-cover {');
  return start === -1 ? '' : css.slice(start, css.indexOf('}', start));
}

test('the menu button wears the search button\'s own styling', async () => {
  // Both buttons share the bar — on a phone they are neighbours — so a raised,
  // bordered one beside a flat one reads as two kinds of control. The menu button
  // takes the search toggle's surface, size, radius and hover outright, rather than
  // a second set of numbers that can drift from it.
  const css = await readProjectFile('app/globals.css');
  const block = (from, to) => css.slice(css.indexOf(from), css.indexOf(to));
  const declaration = (cssBlock, property) =>
    new RegExp(`${property}:\\s*([^;]+);`).exec(cssBlock)?.[1].trim();
  const toggle = block('.search-toggle {', '.search-toggle:hover');
  const button = block('.menu-btn {', '.menu-btn:hover');
  assert.equal(declaration(button, 'background'), declaration(toggle, 'background'), 'the same flat surface');
  assert.equal(declaration(button, 'border-radius'), declaration(toggle, 'border-radius'), 'the same corner');
  for (const side of ['width', 'height']) {
    assert.equal(declaration(button, side), declaration(toggle, side), `the same ${side}`);
  }
  assert.ok(declaration(button, 'border') === '0', 'neither button draws a border');
  assert.doesNotMatch(button, /box-shadow/, 'a bar button does not sit on a shadow');
  const hover = declaration(block('.search-toggle:hover', '.search-toggle svg'), 'background');
  assert.equal(
    declaration(block('.menu-btn:hover', '.menu-btn:active'), 'background'),
    hover,
    'and it answers a pointer the same way',
  );
  // Open is a state, not a lift: the brand's colour and a ring of it, no elevation.
  const open = block('.menu-btn[aria-expanded="true"] {', '.menu-bars {');
  assert.match(open, /color: var\(--blue\)/);
  assert.match(open, /box-shadow: 0 0 0 2px/);
  assert.doesNotMatch(open, /0 8px|0 12px|0 40px/, 'the open state adds no shadow to lift it');
});

test('the menu panel is solid paper, not glass', async () => {
  const css = await readProjectFile('app/globals.css');
  const panel = css.slice(css.indexOf('.menu-panel {'), css.indexOf('.menu-panel[data-state="closed"]'));
  assert.match(panel, /background: #ffffff;/, 'the panel paints its own surface');
  assert.doesNotMatch(panel, /backdrop-filter/, 'and shows nothing through itself');
  assert.doesNotMatch(
    panel,
    /background: rgba\(255, 255, 255, 0\.\d+\)/,
    'nor is it white glass pretending to be solid',
  );
  // The scrim behind it keeps its blur: that is the page dimming, not the panel.
  assert.match(css.slice(css.indexOf('.menu-backdrop {')), /backdrop-filter: blur/, 'the page behind is still dimmed');
});

test('the saved stories row is in the menu with or without a session', async () => {
  const menu = await readProjectFile('components/dashboard/site-menu.tsx');
  assert.match(menu, /const SAVED_ITEM: MenuItem = \{[\s\S]*?action: "saved"/, 'the row is declared once');
  const guest = menu.slice(menu.indexOf('const GUEST_ITEMS'), menu.indexOf('const ACCOUNT_ITEMS'));
  const member = menu.slice(menu.indexOf('const ACCOUNT_ITEMS'), menu.indexOf('export function sectionHref'));
  assert.match(guest, /\[SAVED_ITEM\]/, 'a visitor sees their bookmarks');
  assert.match(member, /\[\s*SAVED_ITEM/, 'and a member sees the same row first, so signing in does not move it');
  assert.match(member, /action: "logout"/, 'log out stays the foot\'s button');
  const header = await readProjectFile('components/dashboard/dashboard-header.tsx');
  assert.doesNotMatch(header, /"saved"/, 'the header must not hide the row the menu now keeps');
});
