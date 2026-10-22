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
  // The reel deck is a snap container: one screen tall, with the cards themselves free to be
  // as wide as the column. A shared reel lands on the same deck, and an unclaimed slug is a
  // 404 rather than a reel.
  '/flipps/',
  '/flipps/no-such-story/',
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
  // The filled profile the preview fixture owns, beside the missing one above:
  // the band, the overlapping avatar, the strip and the report rows are the
  // page's widest content at every breakpoint this test drives.
  '/u/rafia_islam/',
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
          // The homepage is the reference design's home view: the connected
          // deck over the week's reports, the reader links into each story, and
          // both story carousels are what prove it rendered at this width.
          if (route === '/') {
            const home = await page.evaluate(() => ({
              hero: !!document.querySelector('section[aria-label="প্রধান প্রতিবেদন"]'),
              deck: document.querySelectorAll('[data-offset]').length,
              stories: document.querySelectorAll('a[href^="/news/"]').length,
              carousels: document.querySelectorAll('.carousel').length,
            }));
            if (!home.hero || home.deck < 3 || home.stories === 0 || home.carousels < 2) {
              failures.push(
                `${route} at ${width}px: the front page did not render (hero: ${home.hero}, deck cards: ${home.deck}, stories: ${home.stories}, carousels: ${home.carousels})`,
              );
            }
          }
          // A profile page always renders its editorial shell — the band — and then
          // either a filled profile or the missing one: this build may have a real
          // database behind it (where the handle is unknown, or is a preview
          // fixture's) or none at all, and both are correct renders. Both arrive
          // after the page's own read, so wait for it to settle before measuring:
          // the loading shell is not a page anyone reads.
          if (route.startsWith('/u/')) {
            await page
              .waitForFunction(
                () =>
                  document.querySelector('.pf-band') !== null &&
                  (document.querySelector('.pf-stat') !== null ||
                    document.body.textContent.includes('প্রোফাইল পাওয়া যায়নি')),
                undefined,
                { timeout: 15000 },
              )
              .catch(() => undefined);
            const profile = await page.evaluate(() => ({
              band: !!document.querySelector('.pf-band'),
              head: !!document.querySelector('.pf-head'),
              stats: document.querySelectorAll('.pf-stat').length,
              rows: document.querySelectorAll('.pf-entry').length,
              missing: [
                ...document.querySelectorAll('.pf-main, .pf-layout'),
              ].some((node) => node.textContent.includes('প্রোফাইল পাওয়া যায়নি')),
            }));
            const filled =
              profile.head && profile.stats >= 4 && profile.rows > 0;
            if (!profile.band || !(filled || profile.missing)) {
              failures.push(
                `${route} at ${width}px: the profile rendered neither a member nor the missing-profile page (band: ${profile.band}, head: ${profile.head}, stats: ${profile.stats}, rows: ${profile.rows})`,
              );
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

test('the site menu fits inside a phone viewport', async () => {
  // A menu that carried a সংবাদ বিভাগ submenu once pushed itself past a phone's
  // fold, so the menu itself has to be measured, not just the page under it — and
  // it matters more now that the one menu holds the desks and the whole account.
  // This boots the same production build and opens the menu at the widths and
  // heights a phone reports: it must stay on-screen, and on a screen shorter than
  // the menu, it must scroll inside itself rather than run past the fold.
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
        { width: 390, height: 844 },
        { width: 390, height: 640 },
        { width: 360, height: 740 },
        // Shorter than the menu: it must stay on-screen and scroll internally.
        { width: 390, height: 150 },
      ]) {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
        });
        await page.route('**/*', (handler) => (handler.request().url().startsWith(origin) ? handler.continue() : handler.abort()));
        try {
          await page.goto(`${origin}/`, { waitUntil: 'load' });
          const trigger = page.locator('[data-menu-trigger]');
          await trigger.waitFor({ state: 'visible', timeout: 10000 });
          await trigger.click();
          await page.locator('[data-menu-panel]').waitFor({ state: 'visible', timeout: 5000 });
          // The panel opens on a spring with its lines arriving behind it, so
          // measure it once that wave has settled.
          await page.waitForTimeout(900);

          const measured = await page.evaluate(() => {
            const panel = document.querySelector('[data-menu-panel]');
            if (!panel) return null;
            const rect = panel.getBoundingClientRect();
            const root = document.documentElement;
            return {
              role: panel.getAttribute('role'),
              top: rect.top,
              left: rect.left,
              right: rect.right,
              bottom: rect.bottom,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
              horizontalOverflow: root.scrollWidth - root.clientWidth,
              // The panel is its own scroller: the content's height against the
              // height the panel was given by the viewport.
              scrollHeight: panel.scrollHeight,
              clientHeight: panel.clientHeight,
              overflowY: getComputedStyle(panel).overflowY,
            };
          });

          const label = `${viewport.width}x${viewport.height}`;
          if (!measured) {
            failures.push(`${label}: the site menu never opened`);
            continue;
          }
          if (measured.role !== 'dialog') {
            failures.push(
              `${label}: the menu is not a dialog to a screen reader (role: ${measured.role})`,
            );
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

          // A menu taller than the panel is handled by scrolling the panel, never
          // by clipping an entry or hanging off the fold.
          const scrolls = measured.scrollHeight > measured.clientHeight + tolerance;
          if (scrolls && measured.overflowY !== 'auto' && measured.overflowY !== 'scroll') {
            failures.push(
              `${label}: the menu is taller than its panel (${measured.scrollHeight}px in ${measured.clientHeight}px) but does not scroll (overflow-y: ${measured.overflowY})`,
            );
          }

          if (scrolls) {
            // Every line, including the foot of the menu, has to be reachable.
            const reachable = await page.evaluate(() => {
              const panel = document.querySelector('[data-menu-panel]');
              if (!panel) return null;
              panel.scrollTop = panel.scrollHeight;
              const last = panel.lastElementChild?.getBoundingClientRect();
              const box = panel.getBoundingClientRect();
              return {
                lastBottom: last?.bottom ?? Number.POSITIVE_INFINITY,
                panelBottom: box.bottom,
              };
            });
            if (!reachable || reachable.lastBottom > reachable.panelBottom + tolerance) {
              failures.push(
                `${label}: the last line of the menu is unreachable after scrolling (bottom ${Math.round(reachable?.lastBottom ?? -1)} vs panel ${Math.round(reachable?.panelBottom ?? 0)})`,
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

  assert.deepEqual(failures, [], `the site menu did not fit the viewport:\n  ${failures.join('\n  ')}`);
});
