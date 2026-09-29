import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';
import { syncTopbarState } from '../src/scripts/header-state.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the legacy redirects file contains only supported path redirects', async () => {
  const redirects = await readProjectFile('public/_redirects');
  assert.doesNotMatch(redirects, /^https?:\/\//m, 'host redirects belong in a Cloudflare Redirect Rule, not Pages _redirects');
});

test('the routing manifest sends the homepage through its SSR function', async () => {
  const routes = JSON.parse(await readProjectFile('public/_routes.json'));
  assert.ok(routes.include.includes('/'), 'the homepage must run the SSR feed function');
});

test('Astro dev serves its client module and production emits versioned asset URLs', async () => {
  const layout = await readProjectFile('src/layouts/BaseLayout.astro');
  assert.match(layout, /import\.meta\.env\.DEV \? '\/src\/scripts\/client\.ts' : clientJsSrc/);
  await access(new URL('../src/scripts/client.ts', import.meta.url));

  // Every deployment must reference its stylesheet and bundle through a content-derived
  // version parameter, so fresh markup can never pair with a stale cached asset on any
  // hostname (dutimz.com and www.dutimz.com cache independently).
  const version = (await readProjectFile('src/generated/asset-version.ts')).match(/ASSET_VERSION = '([^']+)'/)?.[1];
  assert.ok(version, 'generated asset version module must exist');
  const homepage = await readProjectFile('dist/index.html');
  const reelStyles = await readProjectFile('public/site.css');
  const homepageWithStyles = homepage.replace('</head>', `<style>${reelStyles}</style></head>`);
  assert.match(homepage, /data-connected-carousel/, 'the built homepage should contain the new server-rendered carousel');
  assert.match(homepage, /<h1[^>]*id="featured-title"/, 'the selected story remains the page h1');
  assert.match(homepage, /id="connected-carousel-active"/, 'the active story is rendered in the accessible carousel panel');
  assert.match(homepage, /data-carousel-title/, 'the selected-story title renders server-side');
  assert.ok((homepage.match(/data-carousel-item/g) ?? []).length >= 1, 'the built carousel should include selectable story previews');
  assert.match(reelStyles, /\.connected-carousel__track\s*\{[^}]*transition:\s*transform/s, 'the slide track animates smoothly');
  assert.match(reelStyles, /\.connected-carousel__viewport\s*\{[^}]*overflow:\s*hidden/s, 'the responsive thumbnail viewport clips the sliding track');
  assert.match(homepage, /data-carousel-track/, 'the homepage contains the sliding thumbnail track');
  assert.doesNotMatch(homepage.slice(homepage.indexOf('<section class="connected-carousel-band"'), homepage.indexOf('</section>', homepage.indexOf('<section class="connected-carousel-band"'))), /data-author|data-quote|data-carousel-author|data-role/, 'the carousel only presents thumbnails without author or excerpt fields');
  assert.doesNotMatch(homepage, /data-halo-reel/, 'the previous halo reel markup is removed');
  assert.doesNotMatch(reelStyles, /(?:^|[,{\\s])\.halo-(?:band|layout|reel|card|detail)(?:[_-]|\\s|\{|:)/m, 'the previous halo section styles are removed');
  assert.match(homepage, new RegExp(`<link rel="stylesheet" href="/site\\.css\\?v=${version}">`));
  assert.match(homepage, new RegExp(`<script[^>]+src="/client\\.js\\?v=${version}"[^>]*><\\/script>`));
  const renderLib = await readProjectFile('functions/_lib/render.ts');
  assert.match(renderLib, /site\.css\?v=\$\{ASSET_VERSION\}/);
  assert.match(renderLib, /client\.js\?v=\$\{ASSET_VERSION\}/);
  const clientBundle = await readProjectFile('dist/client.js');
  assert.ok(clientBundle.length > 0, 'production client bundle must not be empty');

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(homepageWithStyles, { waitUntil: 'load' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('[data-connected-carousel]').evaluate((element) => { element.dataset.carouselInterval = '1500'; });
    await page.addScriptTag({ content: clientBundle });
    await page.waitForFunction(() => document.querySelector('[data-connected-carousel]')?.dataset.carouselReady === 'true');
    const initialTitle = await page.locator('[data-carousel-title]').textContent();
    const initialHref = await page.locator('[data-carousel-link]').getAttribute('href');
    await page.waitForFunction((title) => document.querySelector('[data-carousel-title]')?.textContent !== title, initialTitle, { timeout: 5000 });
    const selectedState = await page.locator('[data-connected-carousel]').evaluate((element) => {
      const index = Number(element.querySelector('[data-carousel-active]')?.getAttribute('data-active-index'));
      const source = element.querySelector(`[data-carousel-item][data-index="${index}"]`);
      return { title: element.querySelector('[data-carousel-title]')?.textContent, href: element.querySelector('[data-carousel-link]')?.getAttribute('href'), sourceTitle: source?.dataset.stat, sourceHref: source?.dataset.href, activeIndex: index, transform: getComputedStyle(element.querySelector('[data-carousel-track]')).transform };
    });
    assert.notEqual(selectedState.title, initialTitle, 'autoplay should select another story');
    assert.equal(selectedState.title, selectedState.sourceTitle, 'the selected story title follows its item');
    assert.equal(selectedState.href, selectedState.sourceHref, 'the read link follows the selected story');
    assert.notEqual(selectedState.href, initialHref);
    assert.notEqual(selectedState.transform, 'none', 'the track should move using a composited transform');
    await page.waitForTimeout(850);
    const beforeSwipe = await page.locator('[data-carousel-active]').getAttribute('data-active-index');
    await page.locator('[data-carousel-viewport]').evaluate((element) => {
      element.dispatchEvent(new TouchEvent('touchstart', { touches: [new Touch({ identifier: 1, target: element, clientX: 260, clientY: 120 })], bubbles: true }));
      element.dispatchEvent(new TouchEvent('touchend', { changedTouches: [new Touch({ identifier: 1, target: element, clientX: 80, clientY: 120 })], bubbles: true }));
    });
    await page.waitForFunction((index) => document.querySelector('[data-carousel-active]')?.getAttribute('data-active-index') !== index, beforeSwipe);

    await page.locator('[data-connected-carousel]').focus();

    await page.locator('[data-connected-carousel]').focus();
    const beforeKeyboardTitle = await page.locator('[data-carousel-title]').textContent();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction((title) => document.querySelector('[data-carousel-title]')?.textContent !== title, beforeKeyboardTitle);
    const afterKeyboard = await page.locator('[data-carousel-title]').textContent();
    await page.locator('[data-carousel-next]').click();
    await page.waitForFunction((title) => document.querySelector('[data-carousel-title]')?.textContent !== title, afterKeyboard);

    const mobilePage = await browser.newPage({ viewport: { width: 375, height: 800 }, reducedMotion: 'reduce' });
    await mobilePage.setContent(homepageWithStyles, { waitUntil: 'load' });
    await mobilePage.addScriptTag({ content: clientBundle });
    await mobilePage.waitForFunction(() => document.querySelector('[data-connected-carousel]')?.dataset.carouselReady === 'true');
    const initialMobileTitle = await mobilePage.locator('[data-carousel-title]').textContent();
    await mobilePage.locator('[data-carousel-next]').click();
    await mobilePage.waitForFunction((title) => document.querySelector('[data-carousel-title]')?.textContent !== title, initialMobileTitle);
    const mobileState = await mobilePage.locator('[data-connected-carousel]').evaluate((element) => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      title: element.querySelector('[data-carousel-title]')?.textContent,
      imageWidth: element.querySelector('.connected-carousel__image')?.getBoundingClientRect().width,
      viewportWidth: element.querySelector('[data-carousel-viewport]')?.getBoundingClientRect().width,
    }));
    assert.equal(mobileState.overflow, false, 'the carousel must not create page-level horizontal overflow');
    assert.ok(mobileState.imageWidth <= mobileState.viewportWidth, 'the mobile thumbnail should fit its viewport');
    await mobilePage.waitForTimeout(1400);
    assert.equal(await mobilePage.locator('[data-carousel-title]').textContent(), mobileState.title, 'reduced-motion users do not get autoplay');
    await mobilePage.close();

  } finally {
    await browser.close();
  }
});

test('responsive DUTIMZ header keeps its routes and accessible mobile navigation', async () => {
  const classes = new Set();
  const topbar = { classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } } };
  syncTopbarState(topbar, 0);
  assert.equal(classes.has('is-stuck'), false, 'header starts at the top');
  syncTopbarState(topbar, 1);
  assert.equal(classes.has('is-stuck'), true, 'sticky state follows scroll');
  syncTopbarState(topbar, 0);
  assert.equal(classes.has('is-stuck'), false, 'sticky state clears on return to top');

  const header = await readProjectFile('src/components/SiteHeader.astro');
  for (const route of ['/statistics/', '/about/', '/guidelines/', '/corrections/', '/category/${category.slug}/']) {
    assert.ok(header.includes(route), `header should retain ${route}`);
  }
  assert.match(header, /data-open-search-popup/);
  assert.match(header, /data-account-toggle/);
  assert.match(header, /data-breaking-bar/);
  assert.match(header, /aria-controls="mobile-menu"/);
  assert.match(header, /data-mobile-menu-backdrop/);
  const publicProfile = await readProjectFile('src/pages/u/[username].astro');
  assert.match(publicProfile, /getStaticPaths\(\) \{ return \[\]; \}/);
  assert.match(publicProfile, /data-public-avatar/);
  assert.match(publicProfile, /data-public-stories/);
  const dynamicProfile = await readProjectFile('functions/u/[username].ts');
  assert.match(dynamicProfile, /username.*eq\./);
  assert.match(dynamicProfile, /status.*eq\.published/);

  const client = await readProjectFile('src/scripts/client.ts');
  assert.match(client, /syncTopbarState\(topbar, window\.scrollY\)/);
  assert.match(client, /data-header-dropdown-toggle/);
  assert.match(client, /data-mobile-menu-toggle/);
  assert.match(client, /event\.key === 'Escape'/);
  assert.match(client, /document\.body\.style\.overflow = 'hidden'/);

  const css = await readProjectFile('public/site.css');
  const responsiveNavigation = css.slice(css.lastIndexOf('/* Responsive editorial navigation'));
  assert.match(css, /\.primary-navigation\s*\{[^}]*justify-content:\s*center/s);
  assert.match(css, /\.mobile-menu-backdrop\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.mobile-menu-toggle\s*\{[^}]*display:\s*grid/s);
  assert.match(responsiveNavigation, /\.site-topbar\.is-stuck \.breaking-bar\s*\{[^}]*max-height:\s*0[^}]*visibility:\s*hidden/s, 'breaking ticker collapses after the header sticks');
  assert.ok(responsiveNavigation.includes('.header-actions > .header-search-trigger { display: none;'), 'mobile search uses the dock rather than duplicating the header action');
  const layout = await readProjectFile('src/layouts/BaseLayout.astro');
  assert.match(layout, /data-open-search-popup/);
  const account = await readProjectFile('src/pages/account/index.astro');
  assert.match(account, /data-dashboard-public-link/);
  const profileEditor = await readProjectFile('src/pages/profile/me/index.astro');
  assert.match(profileEditor, /data-profile-public-link/);
  const migration = await readProjectFile('supabase/migrations/202609280003_public_user_profiles.sql');
  assert.match(migration, /from auth\.users u\s+on conflict \(id\) do nothing/s);
});

test('fixed box metrics stay in step with the enlarged type', async () => {
  const css = await readProjectFile('public/site.css');
  assert.match(css, /--type-scale:\s*([\d.]+)/, 'the type scale should be tunable from one place');
  assert.match(css, /--box-scale:\s*([\d.]+)/, 'icon and mark sizes should be tunable too');
  assert.match(css, /--space-scale:\s*([\d.]+)/, 'the spacing rhythm should be tunable too');
  const scale = (name) => css.match(new RegExp(`--${name}:\\s*([\\d.]+)`))[1];
  assert.equal(scale('type-scale'), scale('box-scale'), 'boxes and type must scale by the same factor or the fit they were designed around drifts');
  assert.equal(scale('type-scale'), scale('space-scale'), 'gaps and padding must scale with the type or larger text sits in the same tight rhythm');
  assert.match(css, /svg \{ display: block; width: calc\(21px \* var\(--box-scale\)\)/, 'the base icon size should follow the box scale');
  assert.doesNotMatch(css, /svg \{[^}]*\bwidth: \d+px/, 'no icon should keep a fixed pixel width');
  assert.doesNotMatch(css, /\.account-avatar \{[^}]*width: \d+px/, 'avatar marks should follow the box scale');

  // Every gap and padding has to carry the spacing scale, or that one rule silently keeps
  // the old tight rhythm while the type around it grows. A bare px value is the tell; the
  // clamp() and calc(env(...)) fluents are left alone because they already adapt.
  // The leading guard keeps composite properties such as scroll-padding-top, which offsets
  // anchor jumps rather than spacing the layout, out of the check.
  const spacing = css.match(/(?<![A-Za-z0-9_-])(?:row-gap|column-gap|gap|padding(?:-[a-z]+)?)\s*:\s*[^;}]+/g) ?? [];
  const unscaled = spacing.filter((declaration) => declaration.split(/\s+/).some((token) => /^\d+(?:\.\d+)?px$/.test(token)));
  assert.deepEqual(unscaled, [], `gaps and padding should scale with the type: ${unscaled.join(' | ')}`);
  assert.ok((css.match(/var\(--space-scale\)/g) ?? []).length > 300, 'the spacing scale should reach across the stylesheet, not a handful of rules');
});

test('the publishing form is reserved for signed-in accounts', async () => {
  const write = await readProjectFile('src/pages/account/write.astro');
  assert.match(write, /<form class=.article-editor. data-article-form data-signed-in-only hidden>/, 'the editor should start hidden and be revealed only for a session');
  assert.match(write, /class=.writer-gate. data-signed-out-only hidden/, 'signed-out visitors should get a prompt instead of the editor');
  assert.match(write, /data-application-section data-signed-in-only hidden/, 'applying as a reporter also needs an account');
  assert.match(write, /href=.\/auth\/sign-in\//, 'the prompt should send visitors to the sign-in page');
  assert.doesNotMatch(write, /name=.(?:author|reporter|display|byline)[_-]?name./i, 'the byline comes from the account, not a form field');
  const client = await readProjectFile('src/scripts/client.ts');
  assert.doesNotMatch(client, /p_(?:author|reporter)_name/, 'the submit call should not send an author name');
  const css = await readProjectFile('public/site.css');
  assert.match(css, /\.writer-gate \{/);
});

test('admin dashboard groups protected tools into accessible, useful tabs', async () => {
  const admin = await readProjectFile('src/pages/account/admin.astro');
  for (const tab of ['overview', 'people', 'content', 'questionnaire', 'finance', 'community', 'audit']) {
    assert.match(admin, new RegExp(`data-admin-tab="${tab}"`), `admin dashboard should provide the ${tab} tab`);
    assert.match(admin, new RegExp(`data-admin-panel="${tab}"`), `admin dashboard should provide the ${tab} panel`);
  }
  const questionnairePanel = admin.slice(admin.indexOf('data-admin-panel="questionnaire"'), admin.indexOf('data-admin-panel="finance"'));
  assert.match(questionnairePanel, /data-questionnaire-editor/, 'the questionnaire editor should live in its own tab panel');
  assert.doesNotMatch(admin.slice(admin.indexOf('data-admin-panel="content"'), admin.indexOf('data-admin-panel="questionnaire"')), /data-questionnaire-editor/, 'the questionnaire editor should no longer be buried in the content tab');
  assert.match(admin, /data-admin-jump="questionnaire"/, 'overview shortcuts should link to the questionnaire tab');
  assert.match(admin, /data-admin-dashboard hidden/);
  assert.match(admin, /data-admin-access-message/);
  assert.match(admin, /data-admin-user-search/);
  assert.match(admin, /data-admin-article-search/);
  assert.match(admin, /data-admin-balance-form/);
  assert.match(admin, /data-admin-comment-filter/);
  const client = await readProjectFile('src/scripts/client.ts');
  assert.match(client, /event\.key === 'ArrowRight'/);
  assert.match(client, /event\.key === 'ArrowLeft'/);
  assert.match(client, /initAdminUserSearch\(\)/);
  assert.match(client, /rpc\('admin_member_records'/);
  assert.match(client, /data-admin-user-next/);
  assert.match(client, /data-admin-select-user/);
  const css = await readProjectFile('public/site.css');
  assert.match(css, /\.admin-dashboard \[hidden\].*display:\s*none\s*!important/);
  assert.match(css, /\.admin-tabs\s*\{[^}]*overflow-x:\s*auto/s);
});

test('the completion form only opens when the site needs a complete profile', async () => {
  const client = await readProjectFile('src/scripts/client.ts');
  // It used to open itself on every visit, remembered only for the browser session, so an
  // incomplete profile was re-asked on every new visit. Nothing opens it on load any more.
  assert.doesNotMatch(client, /maybeOpenProfilePrompt/);
  assert.doesNotMatch(client, /sessionStorage[\s\S]{0,80}profile-prompt/, 'the per-session suppression should be gone along with the automatic prompt');
  assert.match(client, /await Promise\.all\(\[\s*loadWalletHistory\(user\.id\),\s*loadSavedStories\(user\.id\),\s*loadOwnArticles\(\),\s*\]\);/, 'dashboard data should load concurrently without opening the completion form');

  // It opens on purpose instead: from the dashboard button, and when withdrawing, which is the
  // one action that genuinely requires a complete profile.
  assert.match(client, /document\.querySelectorAll<HTMLElement>\('\[data-open-profile\]'\)\.forEach\(\(button\) => button\.addEventListener\('click', \(\) => \{ void openProfilePrompt\(\); \}\)\);/);
  assert.match(client, /if \(profileCompletion < 100\) \{ await openProfilePrompt\('টাকা তুলতে প্রোফাইল ১০০% সম্পূর্ণ হতে হবে।/, 'withdrawing is where the completion form is genuinely required');
  const reason = await readProjectFile('src/layouts/BaseLayout.astro');
  assert.match(reason, /<p class="profile-modal__reason" role="status" data-profile-modal-reason hidden><\/p>/, 'the form has to be able to say why it opened');
  const css = await readProjectFile('public/site.css');
  assert.match(css, /\.profile-modal__reason \{/);

  // And the rule behind it is enforced by the database, not only by the interface.
  const schema = await readProjectFile('supabase/migrations/202609240001_initial_schema.sql');
  assert.match(schema, /if completion <> 100 then raise exception/);
});
