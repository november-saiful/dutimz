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
  '/account/',
  '/account/write/',
  '/account/balance/',
  '/account/moderation/',
  '/account/admin/',
  '/spotlight/',
  // Dynamic shells in demo mode: the 404 page, an unknown section, and a
  // missing profile. None of them may overflow either.
  '/news/no-such-story/',
  '/category/no-such-section/',
  '/u/nosuchuser/',
  '/no-such-page/',
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
          // The homepage deck is one layout — the desktop one — scaled to the box
          // it is given, so a phone shows a smaller copy of the desktop deck rather
          // than a rearrangement of it. When the card gets too small for its own
          // smaller type, that type is dropped instead of printed unreadably.
          if (route === '/') {
            await page
              .waitForFunction(
                () =>
                  document.querySelector(
                    '[aria-roledescription="carousel"] #carousel-view-panel > div > div',
                  )?.style.opacity === '1',
                null,
                { timeout: 5000 },
              )
              .catch(() => {});
            const deck = await page.evaluate(() => {
              const root = document.querySelector('[aria-roledescription="carousel"]');
              const surface = root?.querySelector('#carousel-view-panel > div > div');
              const active = surface?.querySelector('[data-offset="0"]');
              if (!surface || !active) return null;
              const card = active.getBoundingClientRect();
              const chips = [...active.querySelectorAll('span')].filter((span) =>
                String(span.className).includes('rounded-[4px]'),
              ).length;
              return {
                scale: Number(/scale\(([\d.]+)\)/.exec(surface.style.transform)?.[1] ?? 0),
                // The ring is drawn at most 1:1, so its box is capped at the design's
                // own 1012px however wide the page gets.
                box: Math.min(1, root.clientWidth / 1012),
                width: card.width,
                height: card.height,
                quote: !!active.querySelector('p'),
                badge: !!active.querySelector('span[class*="bg-primary/10"]'),
                chips,
              };
            });
            // Allow a pixel of rounding either way on a measured box.
            const near = (a, b) => Math.abs(a - b) <= 1;
            if (!deck) {
              failures.push(`${route} at ${width}px: the deck did not render`);
            } else {
              if (!near(deck.scale, deck.box)) {
                failures.push(
                  `${route} at ${width}px: the deck is not scaled to its own box (scale ${deck.scale} for a ${deck.box} box)`,
                );
              }
              if (!near(deck.width, 762 * deck.scale) || !near(deck.height, 513 * deck.scale)) {
                failures.push(
                  `${route} at ${width}px: the card in focus is not the desktop card scaled (${Math.round(deck.width)}×${Math.round(deck.height)} at scale ${deck.scale})`,
                );
              }
              // Every card shows its section badge, short description and byline
              // chips at every scale — a deck carrying only the headline read empty.
              if (!deck.quote || !deck.badge || deck.chips === 0) {
                failures.push(
                  `${route} at ${width}px: the card is missing its badge, short description or chips at scale ${deck.scale}`,
                );
              }
            }
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

test('the account dropdown fits inside a phone viewport', async () => {
  // The unified menu once carried a সংবাদ বিভাগ submenu that pushed it past a
  // phone's fold, so the menu itself has to be measured, not just the page under
  // it. This boots the same production build and opens the menu at the widths and
  // heights a phone reports. On a genuinely short screen the menu must scroll
  // internally rather than hang off the bottom.
  const port = 3198;
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
    {
      env: { ...process.env, NEXT_PUBLIC_DEMO_MODE: 'true' },
      stdio: 'ignore',
    },
  );
  const failures = [];
  try {
    await waitForServer(origin);
    const browser = await chromium.launch();
    try {
      for (const viewport of [
        { width: 390, height: 844, scrolls: false },
        { width: 390, height: 640, scrolls: false },
        { width: 360, height: 740, scrolls: false },
        // Shorter than the menu: it must stay on-screen and scroll internally.
        // The menu is now a short list, so the viewport has to be genuinely tiny.
        { width: 390, height: 150, scrolls: true },
      ]) {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
        });
        await page.route('**/*', (handler) => (handler.request().url().startsWith(origin) ? handler.continue() : handler.abort()));
        try {
          await page.goto(`${origin}/`, { waitUntil: 'load' });
          const trigger = page.locator('[aria-haspopup="menu"]');
          await trigger.waitFor({ state: 'visible', timeout: 10000 });
          await trigger.click();
          await page.locator('[role="menu"]').waitFor({ state: 'visible', timeout: 5000 });
          // The menu animates open over 150ms; measure it once it has settled.
          await page.waitForTimeout(250);

          const measured = await page.evaluate(() => {
            const menu = document.querySelector('[role="menu"]');
            if (!menu) return null;
            const rect = menu.getBoundingClientRect();
            // The first child is the measured-height scroller inside the content.
            const scroller = menu.firstElementChild;
            const root = document.documentElement;
            return {
              top: rect.top,
              left: rect.left,
              right: rect.right,
              bottom: rect.bottom,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
              horizontalOverflow: root.scrollWidth - root.clientWidth,
              scrollHeight: scroller?.scrollHeight ?? rect.height,
              clientHeight: scroller?.clientHeight ?? rect.height,
            };
          });

          const label = `${viewport.width}x${viewport.height}`;
          if (!measured) {
            failures.push(`${label}: the account menu never opened`);
            continue;
          }
          const tolerance = 1;
          if (measured.top < -tolerance || measured.left < -tolerance) {
            failures.push(`${label}: the menu starts off-screen at ${Math.round(measured.top)},${Math.round(measured.left)}`);
          }
          if (measured.right > measured.viewportWidth + tolerance) {
            failures.push(`${label}: the menu is ${Math.round(measured.right - measured.viewportWidth)}px past the right edge`);
          }
          if (measured.bottom > measured.viewportHeight + tolerance) {
            failures.push(`${label}: the menu is ${Math.round(measured.bottom - measured.viewportHeight)}px past the bottom edge`);
          }
          if (measured.horizontalOverflow > 1) {
            failures.push(`${label}: the page overflows horizontally by ${measured.horizontalOverflow}px while the menu is open`);
          }

          // A short viewport is handled by scrolling the menu, never by letting it
          // hang off the screen; a roomy one must not scroll at all.
          const scrolls = measured.scrollHeight > measured.clientHeight + tolerance;
          if (viewport.scrolls && !scrolls) {
            failures.push(
              `${label}: the menu should scroll internally but fits entirely (${measured.scrollHeight}px of content in ${measured.clientHeight}px)`,
            );
          }
          if (!viewport.scrolls && scrolls) {
            failures.push(
              `${label}: the menu scrolls internally though it has room to fit (${measured.scrollHeight}px of content in ${measured.clientHeight}px)`,
            );
          }

          if (scrolls) {
            // Every entry, including the last, has to be reachable by scrolling.
            const reachable = await page.evaluate(() => {
              const menu = document.querySelector('[role="menu"]');
              const scroller = menu?.firstElementChild;
              if (!scroller) return null;
              scroller.scrollTop = scroller.scrollHeight;
              const last = scroller.lastElementChild?.getBoundingClientRect();
              return {
                lastBottom: last?.bottom ?? Number.POSITIVE_INFINITY,
                viewportHeight: window.innerHeight,
              };
            });
            if (!reachable || reachable.lastBottom > reachable.viewportHeight + tolerance) {
              failures.push(
                `${label}: the last menu entry is unreachable after scrolling (bottom ${Math.round(reachable?.lastBottom ?? -1)} vs viewport ${reachable?.viewportHeight ?? 0})`,
              );
            }
          }
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.kill('SIGTERM');
  }

  assert.deepEqual(failures, [], `the account menu did not fit the viewport:\n  ${failures.join('\n  ')}`);
});
