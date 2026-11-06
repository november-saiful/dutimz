// The phone dock's morph, measured in a real browser instead of read off the
// stylesheet.
//
// tests/ui-smoke.test.mjs pins the static contract — the measured label, the
// white chip, the icon squeeze and the panel keyframes — but none of that
// proves the dock behaves: that the current tab is actually the widest one and
// carries its word, that the create menu rises above the card as a dialog and
// returns focus, that a tab switch lands on the new address with the new chip,
// or that the site's one reduced-motion reset reaches the dock. This test drives
// the production build in headless Chromium at a phone viewport and checks each
// of those.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.DOCK_MORPH_PORT ?? 3219);
const BASE = `http://127.0.0.1:${PORT}`;

// The chip has to be wider than an idle tab by the label it reveals; a chip
// that only changes colour is not the morph this dock promises.
const MIN_LABEL_PX = 20;

/**
 * The production server the test runs against, spawned from the build
 * `npm run test:ui` already produced. Demo mode stands in for Supabase, the
 * same way the other interface tests assume; the dock reads the pathname and
 * nothing else, so the content behind it does not matter.
 */
async function startServer() {
  const server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)],
    { cwd: projectRoot, env: { ...process.env, NEXT_PUBLIC_DEMO_MODE: 'true' } },
  );
  let stderr = '';
  server.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });
  const stop = () => {
    server.kill('SIGTERM');
  };
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (server.exitCode !== null && server.exitCode !== 0) {
      stop();
      throw new Error(
        `the dock test needs a production build: \`next start\` exited with ${server.exitCode}.\n${stderr.slice(-2000)}`,
      );
    }
    try {
      const response = await fetch(`${BASE}/`);
      if (response.ok) {
        await response.arrayBuffer();
        return { stop };
      }
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      stop();
      throw new Error(`the test server never answered on ${BASE}.\n${stderr.slice(-2000)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (/executable doesn't exist/i.test(String(error?.message))) {
      throw new Error(
        `Chromium is not installed for Playwright; run \`npx playwright install chromium\` (CI does this before test:ui). Original: ${error.message}`,
      );
    }
    throw error;
  }
}

/** The dock after the label measurement and the Bengali font swap have settled. */
async function waitForSettled(page) {
  await page.waitForSelector('.dock-tab.current .dock-label', { timeout: 15_000 });
  await page.evaluate(() => document.fonts?.ready.catch(() => {}));
  await page.waitForTimeout(700);
}

/** A computed time, in milliseconds. Chrome reports `1e-05s` for the reset. */
function ms(value) {
  const number = Number.parseFloat(value);
  return value.trim().endsWith('ms') ? number : number * 1000;
}

test('the dock morphs its current tab, its create panel and its reduced-motion state', async () => {
  const { stop } = await startServer();
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await waitForSettled(page);

    // Phone-only: the dock is visible at 390px and gone from the layout — out of
    // the accessibility tree, unfocusable — above the dock breakpoint.
    const atRest = await page.evaluate(() => {
      const dock = document.querySelector('.dock');
      const card = document.querySelector('.dock-card');
      const current = document.querySelector('[data-dock="home"][aria-current="page"]');
      const idle = document.querySelector('[data-dock="flipps"]');
      const label = current?.querySelector('.dock-label');
      const idleLabel = idle?.querySelector('.dock-label');
      if (!dock || !card || !current || !idle || !label || !idleLabel) return null;
      return {
        visibility: getComputedStyle(dock).visibility,
        cardBackground: getComputedStyle(card).backgroundColor,
        chipBackground: getComputedStyle(current).backgroundColor,
        currentWidth: current.getBoundingClientRect().width,
        idleWidth: idle.getBoundingClientRect().width,
        labelWidth: label.getBoundingClientRect().width,
        idleLabelWidth: idleLabel.getBoundingClientRect().width,
      };
    });
    assert.ok(atRest, 'the dock did not render its tabs');
    assert.equal(atRest.visibility, 'visible', 'the dock is a phone surface');
    assert.equal(atRest.cardBackground, 'rgb(17, 17, 17)', 'the card is the mockup\'s dark pill, kept neutral');
    assert.equal(atRest.chipBackground, 'rgb(255, 255, 255)', 'the current tab is the white chip');
    assert.ok(
      atRest.currentWidth > atRest.idleWidth + MIN_LABEL_PX,
      `the current tab must open for its label (current ${atRest.currentWidth.toFixed(1)}px vs idle ${atRest.idleWidth.toFixed(1)}px)`,
    );
    assert.ok(
      atRest.labelWidth >= MIN_LABEL_PX,
      `the current tab must show its word (label ${atRest.labelWidth.toFixed(1)}px)`,
    );
    assert.ok(
      atRest.idleLabelWidth < 1,
      `an idle tab keeps its label collapsed (label ${atRest.idleLabelWidth.toFixed(1)}px)`,
    );

    // The icon squeeze is the reference's press, not a scale-down of the whole
    // tab. The create action is pressed here because it is a button: releasing a
    // destination tab would navigate and remount the dock mid-check. Hold the
    // pointer down past the 350ms icon transition so the sampled transform is
    // the squeeze itself, not an arbitrary frame of it.
    const create = page.locator('[data-dock="create"]');
    const iconBox = await create.locator('.dock-icon').boundingBox();
    assert.ok(iconBox, 'the create action has an icon');
    await page.mouse.move(iconBox.x + iconBox.width / 2, iconBox.y + iconBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450);
    const squoze = await create.locator('.dock-icon').evaluate((node) => getComputedStyle(node).transform);
    await page.mouse.up();
    assert.match(
      squoze,
      /matrix\(1\.08, 0, 0, 0\.76,/,
      `a press squeezes the icon the way expo-motion-tabs does (got ${squoze})`,
    );

    // The create menu is the card-morph panel: it rises above the card, announces
    // itself as a dialog, and runs the reference's curve and duration. The
    // release above already opened it (a press is a click).
    const panel = page.locator('.dock-panel');
    await panel.waitFor({ state: 'visible', timeout: 5000 });
    // The panel starts 65px low and scaled down: measure the resting box, not a
    // frame of the morph.
    await page.waitForTimeout(750);
    const morph = await page.evaluate(() => {
      const panelNode = document.querySelector('.dock-panel');
      const cardNode = document.querySelector('.dock-card');
      if (!panelNode || !cardNode) return null;
      const style = getComputedStyle(panelNode);
      const panelBox = panelNode.getBoundingClientRect();
      const cardBox = cardNode.getBoundingClientRect();
      return {
        role: panelNode.getAttribute('role'),
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        animationTimingFunction: style.animationTimingFunction,
        above: panelBox.bottom <= cardBox.top + 1,
      };
    });
    assert.ok(morph, 'the create panel did not render');
    assert.equal(morph.role, 'dialog', 'the menu is a dialog to a screen reader');
    assert.equal(morph.animationName, 'dock-panel-in', 'the panel runs the card-morph keyframes');
    assert.ok(
      ms(morph.animationDuration) >= 570 && ms(morph.animationDuration) <= 630,
      `the panel opens over 600ms (got ${morph.animationDuration})`,
    );
    assert.match(
      morph.animationTimingFunction,
      /cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
      'on the reference curve',
    );
    assert.ok(morph.above, 'the panel grows out of the dock\'s foot, above the card');

    // Escape closes it and hands the caret back to the button that raised it.
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached', timeout: 5000 });
    const focusBack = await page.evaluate(() => document.activeElement?.getAttribute('data-dock') ?? null);
    assert.equal(focusBack, 'create', 'Escape returns the caret to the create action');

    // A real switch: the new address's tab becomes the chip, with its own word.
    await page.click('[data-dock="account"]');
    await page.waitForURL('**/account/', { timeout: 15_000 });
    await waitForSettled(page);
    const switched = await page.evaluate(() => {
      const current = document.querySelector('[data-dock="account"][aria-current="page"]');
      if (!current) return null;
      return {
        currentWidth: current.getBoundingClientRect().width,
        labelWidth: current.querySelector('.dock-label')?.getBoundingClientRect().width ?? 0,
        homeLabel: document.querySelector('[data-dock="home"] .dock-label')?.getBoundingClientRect().width ?? 0,
      };
    });
    assert.ok(switched, 'the account tab did not become current after the switch');
    assert.ok(switched.labelWidth >= MIN_LABEL_PX, 'the new chip opens for its label');
    assert.ok(switched.homeLabel < 1, 'the old chip lets its label collapse');
    assert.ok(switched.currentWidth > MIN_LABEL_PX, 'the new chip has a box to read on');

    await context.close();

    // Above the breakpoint the dock is not a phone surface: hidden, not merely
    // invisible, because a `display:none` box could not be measured — which is
    // why the stylesheet hides it with `visibility`.
    const wide = await browser.newContext({ viewport: { width: 1024, height: 900 } });
    const widePage = await wide.newPage();
    await widePage.goto(`${BASE}/`, { waitUntil: 'load' });
    const hidden = await widePage.evaluate(() => ({
      visibility: getComputedStyle(document.querySelector('.dock')).visibility,
      tabbable: [...document.querySelectorAll('.dock a, .dock button')].every(
        (node) => node.tabIndex < 0 || getComputedStyle(node).visibility === 'hidden',
      ),
    }));
    assert.equal(hidden.visibility, 'hidden', 'the dock is hidden above 860px');
    assert.ok(hidden.tabbable, 'and nothing in it is reachable there');
    await wide.close();

    // The site's one reset collapses the morph for a reader who asked for less
    // motion — end state still arrives, the animation does not.
    const calm = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const calmPage = await calm.newPage();
    await calmPage.goto(`${BASE}/`, { waitUntil: 'load' });
    const durations = await calmPage.evaluate(() => {
      const label = document.querySelector('.dock-tab.current .dock-label');
      const icon = document.querySelector('.dock-tab.current .dock-icon');
      return {
        label: getComputedStyle(label).transitionDuration,
        icon: getComputedStyle(icon).transitionDuration,
      };
    });
    for (const [part, duration] of Object.entries(durations)) {
      assert.ok(
        ms(duration) <= 1,
        `the ${part}'s morph must collapse under reduced motion (got ${duration})`,
      );
    }
    await calm.close();
  } finally {
    await browser.close().catch(() => {});
    stop();
  }
});
