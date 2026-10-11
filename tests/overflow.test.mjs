// A layout guard for the Next.js portal.
//
// Horizontal overflow is invisible in code review and easy to ship. This test
// boots the production build (`next start`) and drives Chromium over every
// static route at common widths. Dynamic routes that need a database are
// covered by their static shells (loading / signed-out / empty states).
//
// Requests are pinned to the local server: pages load a Google font, and
// letting that through would make the measurement depend on the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const WIDTHS = [1920, 1440, 1280, 1121, 1024, 768, 414, 390, 360];
const VIEWPORT_HEIGHT = 900;
const ROUTES = [
  '/',
  '/about/',
  '/guidelines/',
  '/corrections/',
  '/search/',
  // The reel deck is a snap container: one screen tall, with the cards themselves
  // free to be as wide as the column.
  '/flipps/',
  // Dynamic shells in demo mode: the 404 page and an unknown section. Neither
  // of them may overflow either.
  '/news/no-such-story/',
  '/category/no-such-section/',
  '/no-such-page/',
];

test('header search is compact on phones, opens a usable popup, and uses Noto Sans Bengali', async () => {
  const origin = process.env.UI_TEST_ORIGIN || 'http://127.0.0.1:3199';
  const server = process.env.UI_TEST_ORIGIN ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3199'], {
    env: { ...process.env, NEXT_PUBLIC_DEMO_MODE: 'true' },
    stdio: 'ignore',
  });
  let browser;
  try {
    await waitForServer(`${origin}/about/`);
    browser = await chromium.launch();
    for (const width of [360, 390, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 740 } });
      try {
        await page.route('**/*', (handler) => {
          const url = new URL(handler.request().url());
          // Keep automatic link prefetches from compiling unrelated routes in dev runs.
          if (url.origin !== origin || (process.env.UI_TEST_ORIGIN && url.searchParams.has('_rsc'))) return handler.abort();
          return handler.continue();
        });
        await page.route('**/api/search/**', (handler) => handler.fulfill({ json: {
          results: [{ id: 'search-test', slug: 'search-test', title: 'ক্যাম্পাসের সংবাদ', category: 'ক্যাম্পাস' }],
        } }));
        await page.goto(`${origin}/about/`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        const font = await page.locator('body').evaluate((element) => getComputedStyle(element).fontFamily);
        assert.match(font, /Noto[ _]Sans[ _]Bengali/, 'the default body font must be Noto Sans Bengali');
        const trigger = page.locator('header').getByRole('button', { name: 'খবর খুঁজুন', exact: true });
        assert.equal(await trigger.count(), 1, 'only one responsive search trigger is rendered');
        const label = trigger.locator('span').first();
        assert.equal(await label.isVisible(), width >= 1024, 'phones show an icon; desktop keeps the search label');
        const box = await trigger.boundingBox();
        if (width < 1024) {
          assert.equal(box.width, 44);
          assert.equal(box.height, 44);
        }
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: 'খবর খুঁজুন' });
        await dialog.waitFor({ state: 'visible' });
        const input = dialog.getByRole('combobox');
        await input.evaluate((element) => {
          if (element !== document.activeElement) throw new Error('search input must receive focus');
        });
        assert.match(await input.evaluate((element) => getComputedStyle(element).fontFamily), /Noto[ _]Sans[ _]Bengali/);
        await page.waitForTimeout(200);
        const popup = await dialog.boundingBox();
        assert.ok(popup.x >= 0 && popup.x + popup.width <= width, 'popup fits horizontally');
        assert.ok(popup.y >= 0 && popup.y + popup.height <= 740, 'popup fits vertically');
        await input.fill('ক্যাম্পাস');
        await dialog.getByRole('option', { name: 'ক্যাম্পাসের সংবাদ' }).waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        await trigger.evaluate((element) => {
          if (element !== document.activeElement) throw new Error('closing must return focus to search');
        });
        await trigger.click();
        assert.equal(await input.inputValue(), '', 'closing clears the previous query');
        await input.fill('ক্যাম্পাস');
        await dialog.getByRole('option', { name: 'ক্যাম্পাসের সংবাদ' }).waitFor({ state: 'visible' });
        await dialog.getByRole('option', { name: '“ক্যাম্পাস” — সব ফলাফল দেখুন' }).click();
        await page.waitForURL('**/search/?q=*');
        assert.equal(await page.getByRole('dialog').count(), 0, 'selecting a result closes the popup');
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser?.close();
    server?.kill('SIGTERM');
  }
});

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

async function waitForServer(origin, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`next start never came up at ${origin}`);
}

test('every route stays inside the viewport at common widths', async () => {
  const port = 3197;
  const origin = `http://127.0.0.1:${port}`;
  // Spawn through node directly: .bin shims are not executable grand-children
  // on Windows, and shell:true swallows the server's startup errors.
  const server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
    {
    env: { ...process.env, NEXT_PUBLIC_DEMO_MODE: 'true' },
    stdio: 'ignore',
  });
  const failures = [];
  try {
    await waitForServer(origin);
    const browser = await chromium.launch();
    try {
      for (const route of ROUTES) {
        const page = await browser.newPage({ viewport: { width: WIDTHS[0], height: VIEWPORT_HEIGHT }, deviceScaleFactor: 1 });
        await page.route('**/*', (handler) => (handler.request().url().startsWith(origin) ? handler.continue() : handler.abort()));
        // An uncaught error swaps the whole document for Next's error page, which
        // never overflows — so without these two checks every route below would
        // "pass" while rendering nothing. That is exactly how a demo/preview build
        // that threw on a missing Supabase client stayed green.
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(String(error).split('\n')[0].slice(0, 160)));
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
          const response = await page.goto(`${origin}${route}`, { waitUntil: 'load' });
          // A route that genuinely answers 404 (an unknown story, section or
          // profile in demo mode) is a small but correct document, so only the
          // overflow check applies to it. A 200 route that rendered Next's error
          // document is always a failure.
          const notFound = response?.status() === 404;
          const rendered = await page.evaluate(() => ({
            errorDocument: document.documentElement.id === '__next_error__',
            elements: document.querySelectorAll('body *').length,
          }));
          if (!notFound && (rendered.errorDocument || rendered.elements < 20)) {
            failures.push(`${route} at ${width}px: the app did not render (status ${response?.status()}, error document: ${rendered.errorDocument}, ${rendered.elements} elements)`);
            continue;
          }
          if (pageErrors.length) {
            failures.push(`${route} at ${width}px: uncaught client error — ${pageErrors[0]}`);
            break;
          }
          const result = await page.evaluate(measure);
          if (!result.overflow) continue;
          const detail = result.offenders.map((o) => `${o.name} (right ${o.right}, ${o.width} wide)`).join(', ') || 'no single element reported';
          failures.push(`${route} at ${width}px: ${result.overflow}px past the viewport — ${detail}`);
        }
        await page.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.kill('SIGTERM');
  }

  assert.deepEqual(failures, [], `pages failed to render or overflowed:\n  ${failures.join('\n  ')}`);
});
