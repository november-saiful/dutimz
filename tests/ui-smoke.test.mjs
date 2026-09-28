import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { syncTopbarState } from '../src/scripts/header-state.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Astro dev serves its client module and production emits the client bundle', async () => {
  const layout = await readProjectFile('src/layouts/BaseLayout.astro');
  assert.match(layout, /import\.meta\.env\.DEV \? '\/src\/scripts\/client\.ts' : '\/client\.js'/);
  await access(new URL('../src/scripts/client.ts', import.meta.url));

  const homepage = await readProjectFile('dist/index.html');
  assert.match(homepage, /<script[^>]+src="\/client\.js"[^>]*><\/script>/);
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

  const client = await readProjectFile('src/scripts/client.ts');
  assert.match(client, /syncTopbarState\(topbar, window\.scrollY\)/);
  assert.match(client, /data-header-dropdown-toggle/);
  assert.match(client, /data-mobile-menu-toggle/);
  assert.match(client, /event\.key === 'Escape'/);
  assert.match(client, /document\.body\.style\.overflow = 'hidden'/);

  const css = await readProjectFile('public/site.css');
  assert.match(css, /\.primary-navigation\s*\{[^}]*justify-content:\s*center/s);
  assert.match(css, /\.mobile-menu-backdrop\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.mobile-menu-toggle\s*\{[^}]*display:\s*grid/s);
});
