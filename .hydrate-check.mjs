import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 3199;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
  env: { ...process.env, NEXT_PUBLIC_DEMO_MODE: 'true' },
  stdio: 'ignore',
});
async function wait() {
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(origin); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('dev server never came up');
}
try {
  await wait();
  const browser = await chromium.launch();
  for (const width of [414, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await page.route('**/*', (h) => (h.request().url().startsWith(origin) ? h.continue() : h.abort()));
    page.on('console', (m) => { if (m.type() === 'error') console.log(`[${width}px console]`, m.text().slice(0, 4000)); });
    page.on('pageerror', (e) => console.log(`[${width}px pageerror]`, String(e).slice(0, 4000)));
    await page.goto(`${origin}/`, { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    console.log(`--- ${width}px done ---`);
    await page.close();
  }
  await browser.close();
} finally { server.kill('SIGTERM'); }
