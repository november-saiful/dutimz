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
  '/statistics/',
  '/saved/',
  '/auth/sign-in/',
  '/account/',
  '/account/write/',
  '/account/balance/',
  '/profile/me/',
];

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
  const nextBin = process.platform === 'win32' ? 'node_modules/.bin/next.cmd' : 'node_modules/.bin/next';
  const server = spawn(nextBin, ['start', '-p', String(port)], {
    shell: process.platform === 'win32',
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
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
          await page.goto(`${origin}${route}`, { waitUntil: 'load' });
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

  assert.deepEqual(failures, [], `pages overflow horizontally:\n  ${failures.join('\n  ')}`);
});
