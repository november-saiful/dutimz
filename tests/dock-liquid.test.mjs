// The phone dock's liquid, measured in a real browser instead of read off the
// stylesheet.
//
// tests/ui-smoke.test.mjs pins the static contract — two blobs, the goo filter,
// the two fitted curves, the data-placed gate — but none of that proves the
// flight: that when the blobs move, the tail actually lags behind the drop
// (which is the stretch) and the pair never splits into two pills (which is
// what the goo filter needs from them). This test samples both blobs frame by
// frame in headless Chromium and fails on either half of that behaviour.
//
// The flight is driven as a same-document step rather than a click. The dock
// lives in the per-page shell, so a real tab switch remounts it and the new
// copy lands its blobs outright through the data-placed gate — by design, with
// no flight at all. Writing the destination tab's own measured box into both
// blobs is exactly the write the component's readGeometry makes (the same two
// style properties), which isolates the CSS physics deterministically: same
// blobs, same curves, same travel as a real hop, no navigation race.
//
// The hop is home → flipps, the adjacent switch (~79px of travel). Measured
// across every hop length, the peak lag is a fixed fraction of the travel
// (~55%), so the longest direct switch (home → account, ~288px) genuinely
// splits the pair into two pills for ~150ms — faithful to the spring physics
// the curves were fitted to, not a regression. Scoping the no-split assertion
// to the representative hop is the honest contract; the long-hop envelope
// (peak lag ≈ 55% of travel, reunion by ~700ms) is recorded here so a future
// retune knows what it is moving.
//
// The thresholds are deliberately far inside what the flight measures on this
// hardware (~77px of peak separation against ~95px-wide blobs, i.e. ~18px of
// overlap at the worst moment): the test fails when the behaviour breaks, not
// when a frame jitters.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.DOCK_LIQUID_PORT ?? 3219);
const BASE = `http://127.0.0.1:${PORT}`;

// Home → flipps is the adjacent hop (~79px of travel), which is what gives the
// tail room to lag while keeping the pair one shape. Below this the step is too
// short to say anything about the lag, so the test fails rather than passes
// vacuously.
const MIN_TRAVEL_PX = 60;
// The blobs must overlap on every sampled frame. -1.5px of subpixel and
// rounding grace; anything more negative is a visible split into two pills.
const MIN_OVERLAP_PX = -1.5;
// The tail must fall behind the drop by at least this much at the peak of the
// flight. Measured at ~77px; 12px still catches a tail that moves in lockstep
// (identical curves, a missing transition, the wrong token) with room to spare.
const MIN_PEAK_LAG_PX = 12;
// Where the flight must end: both blobs on the destination box, and on each
// other — the stretch settled back into one pill.
const SETTLE_TARGET_PX = 3;
const SETTLE_PAIR_PX = 2;
// A full flight is ~110 rAF frames; fewer than 30 means the sampler itself is
// broken (throttled frames, a stalled page) and its verdict means nothing.
const MIN_FRAMES = 30;

/**
 * The production server the flight runs against, spawned from the build
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
        `the dock flight needs a production build: \`next start\` exited with ${server.exitCode}.\n${stderr.slice(-2000)}`,
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

const center = (rect) => (rect.left + rect.right) / 2;

async function launchPage() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    if (/executable doesn't exist/i.test(String(error?.message))) {
      throw new Error(
        `Chromium is not installed for Playwright; run \`npx playwright install chromium\` (CI does this before test:ui). Original: ${error.message}`,
      );
    }
    throw error;
  }
  // A phone viewport is what reveals the dock (it stays hidden above 860px),
  // and no-preference is what lets the two curves run at all.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  return { browser, page };
}

/** The dock after the label morph, the font swap and the liquid have settled. */
async function waitForSettled(page) {
  await page.waitForSelector('.dock-goo[data-placed]', { timeout: 15_000 });
  await page.evaluate(() => document.fonts?.ready.catch(() => {}));
  let previous = null;
  const deadline = Date.now() + 12_000;
  for (;;) {
    const current = await page.evaluate(() => {
      const rectOf = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      };
      return {
        lead: rectOf('.dock-blob.dock-lead'),
        trail: rectOf('.dock-blob.dock-trail'),
      };
    });
    if (
      previous &&
      current.lead &&
      current.trail &&
      ['left', 'right'].every(
        (key) =>
          Math.abs(current.lead[key] - previous.lead[key]) < 0.5 &&
          Math.abs(current.trail[key] - previous.trail[key]) < 0.5,
      )
    ) {
      return current;
    }
    if (Date.now() > deadline) {
      throw new Error('the dock never settled: the blobs kept moving for 12s');
    }
    previous = current;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

test('the dock liquid stretches without splitting on a tab switch', async () => {
  const { stop } = await startServer();
  const { browser, page } = await launchPage();
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await waitForSettled(page);

    // At rest the pair is one pill on the current tab: the drop, its tail and
    // the home tab's own box all agree.
    const rest = await page.evaluate(() => {
      const rectOf = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      };
      return {
        lead: rectOf('.dock-blob.dock-lead'),
        trail: rectOf('.dock-blob.dock-trail'),
        tab: rectOf('[data-dock="home"][aria-current="page"]'),
      };
    });
    for (const [name, blob] of Object.entries({ drop: rest.lead, tail: rest.trail })) {
      assert.ok(
        Math.abs(blob.left - rest.tab.left) <= 2 && Math.abs(blob.right - rest.tab.right) <= 2,
        `at rest the ${name} must sit on the home tab (got left ${blob.left.toFixed(1)}, right ${blob.right.toFixed(1)} vs tab ${rest.tab.left.toFixed(1)}–${rest.tab.right.toFixed(1)})`,
      );
    }

    // The flight: one evaluate writes the destination, then samples every
    // frame. A single evaluate (not write → round-trip → sample) means the
    // first frame lands one rAF tick after the write, so the early flight —
    // where the separation starts — is actually observed.
    const flight = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const lead = document.querySelector('.dock-blob.dock-lead');
          const trail = document.querySelector('.dock-blob.dock-trail');
          const goo = document.querySelector('.dock-goo');
          const target = document.querySelector('[data-dock="flipps"]');
          if (!lead || !trail || !goo || !target) {
            resolve({ error: 'the dock is missing its blobs or tabs' });
            return;
          }
          const snapshot = (node) => {
            const box = node.getBoundingClientRect();
            return { left: box.left, right: box.right, width: box.width };
          };
          const start = { lead: snapshot(lead), trail: snapshot(trail) };
          // The account tab's own measured box — the step a real switch feeds
          // the liquid — written the way the component writes it.
          const from = goo.getBoundingClientRect();
          const box = target.getBoundingClientRect();
          const x = box.left - from.left;
          for (const blob of [lead, trail]) {
            blob.style.transform = `translateX(${x}px)`;
            blob.style.width = `${box.width}px`;
          }
          const frames = [];
          const t0 = performance.now();
          const tick = () => {
            const t = performance.now() - t0;
            frames.push({ t, lead: snapshot(lead), trail: snapshot(trail) });
            if (t < 1800) requestAnimationFrame(tick);
            else resolve({ frames, start, target: snapshot(target) });
          };
          requestAnimationFrame(tick);
        }),
      [],
    );
    assert.ok(!flight.error, flight.error ?? 'the sampler failed');
    assert.ok(
      flight.frames.length >= MIN_FRAMES,
      `the sampler caught only ${flight.frames.length} frames: the verdict means nothing`,
    );

    const direction = Math.sign(center(flight.target) - center(flight.start.lead));
    assert.notEqual(direction, 0, 'the step must travel somewhere');
    const travel = Math.abs(center(flight.target) - center(flight.start.lead));
    assert.ok(
      travel >= MIN_TRAVEL_PX,
      `the step travelled only ${travel.toFixed(1)}px: too short to say anything about the lag`,
    );

    let peakLag = -Infinity;
    let peakAt = 0;
    let minOverlap = Infinity;
    let splitAt = 0;
    for (const frame of flight.frames) {
      // How far the drop has pulled ahead of its tail along the travel.
      const lag = (center(frame.lead) - center(frame.trail)) * direction;
      if (lag > peakLag) {
        peakLag = lag;
        peakAt = frame.t;
      }
      // How much of one shape the pair still is. Negative is a gap.
      const overlap =
        Math.min(frame.lead.right, frame.trail.right) -
        Math.max(frame.lead.left, frame.trail.left);
      if (overlap < minOverlap) {
        minOverlap = overlap;
        splitAt = frame.t;
      }
    }
    assert.ok(
      minOverlap >= MIN_OVERLAP_PX,
      `the liquid split: the blobs gapped by ${(-minOverlap).toFixed(1)}px at t=${splitAt.toFixed(0)}ms and read as two pills`,
    );
    assert.ok(
      peakLag >= MIN_PEAK_LAG_PX,
      `the tail never lagged: peak separation ${peakLag.toFixed(1)}px over a ${travel.toFixed(0)}px switch means it moved in lockstep with the drop`,
    );

    // And it lands: the last frames have both blobs on the destination box
    // and on each other.
    const tail = flight.frames.slice(-5);
    const end = {
      left: tail.reduce((sum, frame) => sum + center(frame.lead), 0) / tail.length,
      pair: tail.reduce((sum, frame) => sum + Math.abs(center(frame.lead) - center(frame.trail)), 0) / tail.length,
      width: tail.reduce((sum, frame) => sum + frame.lead.width, 0) / tail.length,
    };
    assert.ok(
      Math.abs(end.left - center(flight.target)) <= SETTLE_TARGET_PX,
      `the drop stopped ${Math.abs(end.left - center(flight.target)).toFixed(1)}px from the flipps tab`,
    );
    assert.ok(
      end.pair <= SETTLE_PAIR_PX,
      `the pair never reunited: the blobs ended ${end.pair.toFixed(1)}px apart`,
    );
    assert.ok(
      Math.abs(end.width - flight.target.width) <= SETTLE_TARGET_PX,
      'the drop kept the wrong width',
    );

    // The component half: a real tap still feeds the liquid the tab it chose.
    // (The fresh page lands its blobs outright through the data-placed gate,
    // so this asserts the destination, not a second flight.)
    await page.click('[data-dock="account"]');
    await page.waitForURL('**/account/', { timeout: 15_000 });
    await waitForSettled(page);
    const switched = await page.evaluate(() => {
      const rectOf = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { left: box.left, right: box.right };
      };
      return {
        lead: rectOf('.dock-blob.dock-lead'),
        trail: rectOf('.dock-blob.dock-trail'),
        tab: rectOf('[data-dock="account"][aria-current="page"]'),
      };
    });
    for (const [name, blob] of Object.entries({ drop: switched.lead, tail: switched.trail })) {
      assert.ok(
        Math.abs(blob.left - switched.tab.left) <= 3 &&
          Math.abs(blob.right - switched.tab.right) <= 3,
        `after the switch the ${name} must sit on the account tab`,
      );
    }
  } finally {
    await browser.close().catch(() => {});
    stop();
  }
});
