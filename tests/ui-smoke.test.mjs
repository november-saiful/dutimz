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

test('mobile sticky header stays expanded at page top and collapses only after scrolling', async () => {
  const classes = new Set();
  const topbar = { classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } } };

  syncTopbarState(topbar, 0);
  assert.equal(classes.has('is-stuck'), false, 'header starts expanded at the top');
  syncTopbarState(topbar, 1);
  assert.equal(classes.has('is-stuck'), true, 'header collapses after scrolling');
  syncTopbarState(topbar, 0);
  assert.equal(classes.has('is-stuck'), false, 'header expands again when returned to top');

  const client = await readProjectFile('src/scripts/client.ts');
  assert.match(client, /syncTopbarState\(topbar, window\.scrollY\)/);
  assert.match(client, /addEventListener\('scroll'/);
  assert.match(client, /requestAnimationFrame\(sync\)/);

  const css = await readProjectFile('public/site.css');
  const mobileRulesStart = css.indexOf('@media (max-width: 860px)');
  const mobileRulesEnd = css.indexOf('@media (max-width: 560px)', mobileRulesStart);
  assert.notEqual(mobileRulesStart, -1, 'mobile header breakpoint must exist');
  assert.notEqual(mobileRulesEnd, -1, 'small-phone breakpoint must follow the mobile rules');
  const mobileRules = css.slice(mobileRulesStart, mobileRulesEnd);
  assert.match(css, /\.header-tools\s*\{[^}]*display:\s*flex/s);
  assert.match(mobileRules, /\.site-topbar \.header-tools\s*\{[^}]*max-height:\s*140px/s, 'mobile tools stay visible before scrolling');
  assert.match(mobileRules, /\.site-topbar\.is-stuck \.header-tools\s*\{[^}]*max-height:\s*0[^}]*opacity:\s*0/s, 'mobile tools collapse only in the stuck state');
});
