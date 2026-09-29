// A layout guard for the whole portal.
//
// Horizontal overflow is invisible in code review and easy to ship: the page that
// motivated this test set `width: min(1500px, 100%)` and `margin: 0 10%` on the
// same element, which is 120% of its container, so every desktop page grew a
// horizontal scrollbar and a cut-off sidebar. Nothing in the type checker or the
// string-matching tests could see it — only a real layout engine can, so this
// test drives Chromium over the built pages.
//
// Requests are pinned to the local server: the pages load a Google font, and
// letting that through would make the measurement depend on the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

// The desktop end brackets 1121px, where the percentage-gutter layout switches on
// and where the original regression lived. The narrow end covers the small-screen
// breakpoints, which restate most of the sizes.
const WIDTHS = [1920, 1440, 1280, 1121, 1024, 768, 414, 390, 360];
const VIEWPORT_HEIGHT = 900;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(path));
    else found.push(path);
  }
  return found;
}

// Every static page the build produced, as the route it is served under.
async function builtRoutes() {
  const files = await walk(dist);
  const routes = [];
  for (const file of files) {
    if (extname(file) !== '.html') continue;
    const parts = relative(dist, file).split(sep);
    if (parts[0] === '404.html') continue;
    routes.push('/' + (parts.at(-1) === 'index.html' ? parts.slice(0, -1).join('/') + (parts.length > 1 ? '/' : '') : parts.join('/')));
  }
  return routes.sort();
}

function staticServer() {
  return createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relativePath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const file = resolve(dist, '.' + relativePath);
    if (!file.startsWith(dist)) { response.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
  });
}

// Offenders are reported widest-first so the failure message points straight at
// the element that is too wide rather than at the page as a whole. Elements held
// inside an ancestor's scroll or clip box are skipped: the breaking-news marquee
// is deliberately wider than the page and contributes nothing to the document
// width, so reporting it would send the next reader to the wrong rule.
const measure = () => {
  const rootElement = document.documentElement;
  const overflow = rootElement.scrollWidth - rootElement.clientWidth;
  if (overflow <= 1) return { overflow: 0, offenders: [] };
  const limit = rootElement.clientWidth;
  const contained = (element) => {
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowX !== 'visible') return true;
    }
    return false;
  };
  const offenders = [];
  for (const element of document.querySelectorAll('body *')) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || rect.right <= limit + 1) continue;
    if (contained(element)) continue;
    const name = element.tagName.toLowerCase()
      + (typeof element.className === 'string' && element.className.trim() ? '.' + element.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
    offenders.push({ name, right: Math.round(rect.right), width: Math.round(rect.width) });
  }
  offenders.sort((a, b) => b.right - a.right || b.width - a.width);
  return { overflow, offenders: offenders.slice(0, 5) };
};

test('every built page stays inside the viewport at common widths', async () => {
  await stat(dist).catch(() => assert.fail('dist/ is missing — run `npm run build` before this test'));

  const routes = await builtRoutes();
  assert.ok(routes.length > 4, `expected the build to produce pages, found ${routes.length}`);

  const server = staticServer();
  await new Promise((resolve_) => server.listen(0, '127.0.0.1', resolve_));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const failures = [];

  try {
    for (const route of routes) {
      const page = await browser.newPage({ viewport: { width: WIDTHS[0], height: VIEWPORT_HEIGHT }, deviceScaleFactor: 1 });
      // Keep the measurement hermetic: no analytics, no webfont, no CDN.
      await page.route('**/*', (handler) => (handler.request().url().startsWith(origin) ? handler.continue() : handler.abort()));

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
        await page.goto(`${origin}${route}`, { waitUntil: 'load' });

        const passes = [['as served', false]];
        // Sections behind sign-in are still laid out for real users, so a layout
        // bug there is just as shippable — reveal anything hidden before measuring.
        const revealable = await page.evaluate(() => document.querySelectorAll('main [hidden]').length > 0);
        if (revealable) passes.push(['revealed', true]);

        for (const [label, reveal] of passes) {
          if (reveal) await page.evaluate(() => { for (const element of document.querySelectorAll('main [hidden]')) element.hidden = false; });
          const result = await page.evaluate(measure);
          if (!result.overflow) continue;
          const detail = result.offenders.map((o) => `${o.name} (right ${o.right}, ${o.width} wide)`).join(', ') || 'no single element reported';
          failures.push(`${route} at ${width}px${reveal ? ' with hidden sections revealed' : ''} (${label}): ${result.overflow}px past the viewport — ${detail}`);
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve_) => server.close(resolve_));
  }

  assert.deepEqual(failures, [], `pages overflow horizontally:\n  ${failures.join('\n  ')}`);
});
