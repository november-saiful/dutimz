import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { syncTopbarState } from '../src/scripts/header-state.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

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
  assert.match(homepage, new RegExp(`<link rel="stylesheet" href="/site\\.css\\?v=${version}">`));
  assert.match(homepage, new RegExp(`<script[^>]+src="/client\\.js\\?v=${version}"[^>]*><\\/script>`));
  const renderLib = await readProjectFile('functions/_lib/render.ts');
  assert.match(renderLib, /site\.css\?v=\$\{ASSET_VERSION\}/);
  assert.match(renderLib, /client\.js\?v=\$\{ASSET_VERSION\}/);
  const clientBundle = await readProjectFile('dist/client.js');
  assert.ok(clientBundle.length > 0, 'production client bundle must not be empty');
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

test('admin dashboard groups protected tools into accessible, useful tabs', async () => {
  const admin = await readProjectFile('src/pages/account/admin.astro');
  for (const tab of ['overview', 'people', 'content', 'finance', 'community', 'audit']) {
    assert.match(admin, new RegExp(`data-admin-tab="${tab}"`), `admin dashboard should provide the ${tab} tab`);
    assert.match(admin, new RegExp(`data-admin-panel="${tab}"`), `admin dashboard should provide the ${tab} panel`);
  }
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
  assert.match(client, /ilike\('username'/);
  assert.match(client, /data-admin-select-user/);
  const css = await readProjectFile('public/site.css');
  assert.match(css, /\.admin-dashboard \[hidden\].*display:\s*none\s*!important/);
  assert.match(css, /\.admin-tabs\s*\{[^}]*overflow-x:\s*auto/s);
});
