// A release has to fail when the deployment is broken, and only then.
//
// The live check walks the real site seconds after `wrangler deploy`, and it once failed a
// release that was healthy: at the tail of a walk of 34 URLs, three consecutive requests — the
// last two articles and /sitemap.xml — answered 503 from Cloudflare's edge, and the same three
// URLs answered 200 to a request made a minute later. Nothing restartable was wrong with the
// site; there was nothing to fix except the check's assumption that one 503 is a verdict.
//
// These tests run the real script (`node scripts/verify-live-config.mjs`, the same invocation
// the release uses) against a stub that serves everything the walk asks for, so both halves of
// that behaviour are pinned to the script rather than to a comment: a short burst of 503s is
// waited out, and a deployment that answers 503 to every attempt still fails the release.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../scripts/verify-live-config.mjs', import.meta.url));
const ARTICLE = '/news/article-one';
const SECTION = '/category/campus';

// Every page the walk accepts has to carry these: the asset layer applies public/_headers to
// files, middleware applies them to what the Worker renders, and a stub that skipped them would
// fail the check for a different reason than the one under test.
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=()',
};

const html = (links = []) =>
  `<!doctype html><html><head><title>stub</title></head><body>${links
    .map((href) => `<a href="${href}">link</a>`)
    .join('')}</body></html>`;

/**
 * A stub of the deployment the live check walks: the canonical paths, the security headers, the
 * robots.txt-and-sitemap pair, the cache state on the static page and the anonymous Supabase
 * reads. `fail` is the only thing under test here — it decides, per request, whether this one
 * answers 503 the way Cloudflare's edge did.
 *
 * The cache state is served rather than simulated: the check only ever judges the second visit
 * to /about/, and it is asking whether the header is readable, not whether R2 is real.
 */
async function startStub(fail, homeLinks = [ARTICLE, SECTION, '/statistics/']) {
  const hits = new Map();
  let base = '';
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://stub');
    const seen = (hits.get(url.pathname) ?? 0) + 1;
    hits.set(url.pathname, seen);

    const send = (status, body, headers = {}) => {
      response.writeHead(status, {
        'content-type': 'text/html; charset=utf-8',
        ...SECURITY_HEADERS,
        ...headers,
      });
      response.end(body);
    };

    if (fail({ path: url.pathname, hits: seen, search: url.search })) {
      return send(503, 'This website is currently unavailable.');
    }

    switch (url.pathname) {
      case '/api/config':
        return send(
          200,
          JSON.stringify({
            supabaseUrl: base,
            supabaseAnonKey: 'stub-anon-key',
            mediaUrl: base,
            demoMode: false,
          }),
          { 'content-type': 'application/json' },
        );
      // The anonymous reads the check makes as a signed-out visitor, plus the table it expects
      // to be refused.
      case '/rest/v1/articles':
      case '/rest/v1/categories':
        return send(200, '[]', { 'content-type': 'application/json' });
      case '/rest/v1/earnings_ledger':
        return send(401, '{}', { 'content-type': 'application/json' });
      case '/robots.txt':
        return send(200, `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`, {
          'content-type': 'text/plain',
        });
      case '/sitemap.xml':
        return send(
          200,
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
            `<url><loc>${base}/</loc></url><url><loc>${base}${ARTICLE}/</loc></url></urlset>`,
          { 'content-type': 'application/xml' },
        );
      // The front page is gated on being served from the cache (it is prerendered and uploaded
      // with the deployment), so the stub reports what a real deployment reports: the first visit
      // renders and stores it, every visit after that is a hit.
      case '/':
        return send(200, html(homeLinks), {
          'x-nextjs-cache': seen > 1 ? 'HIT' : 'MISS',
        });
      case '/about/':
        return send(200, html(), { 'x-nextjs-cache': 'HIT' });
      case '/statistics/':
      case '/search/':
      case '/saved/':
      case '/guidelines/':
      case '/corrections/':
      case `${ARTICLE}/`:
      case `${SECTION}/`:
        return send(200, html());
      // Both canonical shapes answer, and the unslashed one hands the visitor to the slashed
      // canonical, which is what the walk asserts.
      case ARTICLE:
      case SECTION:
        return send(301, '', { location: `${url.pathname}/` });
      // The retired university desk lives on as a redirect to campus (the merge migration),
      // so the walk must accept it landing on campus instead of answering 200 itself.
      case '/category/university/':
        return send(308, '', { location: '/category/campus/' });
      case '/category/university':
        return send(301, '', { location: '/category/university/' });
      default:
        return send(404, 'not found');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    hits,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Run the release's own smoke check against the stub, exactly as the release runs it. */
function runCheck(base) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        SITE_URL: base,
        // Tighten every wait the script has, so the test measures the retry rather than the
        // delays it sleeps through. Two attempts is enough to prove a 503 was retried.
        CONFIG_ATTEMPTS: '2',
        CONFIG_DELAY_MS: '10',
        CACHE_ATTEMPTS: '2',
        CACHE_DELAY_MS: '10',
        RETRY_ATTEMPTS: '2',
        RETRY_DELAY_MS: '10',
        REQUEST_TIMEOUT_MS: '5000',
        // An inherited token would send the script looking for the Worker's own hostname.
        CLOUDFLARE_API_TOKEN: '',
        CLOUDFLARE_ACCOUNT_ID: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('a burst of 503s from the edge does not fail a healthy release', async () => {
  // The shape that failed a release: the tail of the walk, not its start. /news/article-one is
  // walked both ways round, and the sitemap is fetched through the redirect-walking helper, so
  // the two failing requests cover both request helpers.
  const stub = await startStub(
    ({ path, hits }) =>
      hits === 1 && (path === '/sitemap.xml' || path === `${SECTION}/` || path === SECTION),
  );
  try {
    const { code, stdout, stderr } = await runCheck(stub.base);

    assert.equal(code, 0, `the check failed a deployment that recovered:\n${stderr}`);
    // The retry has to have actually happened: a stub that never answered 503 would let this
    // test pass against a check with no retry at all.
    const retried = [...stdout.matchAll(/answered HTTP 503 \(attempt 1\/2\)/g)];
    assert.equal(
      retried.length,
      3,
      `each transient 503 must be retried and logged:\n${stdout}`,
    );
    assert.match(stdout, /Live routes OK/);
    assert.match(stdout, /Anonymous access OK/);
    assert.equal(stub.hits.get('/sitemap.xml'), 2, 'the sitemap must have been asked a second time');
  } finally {
    await stub.close();
  }
});

test('a deployment that answers 503 to every attempt still fails the release', async () => {
  const stub = await startStub(({ path }) => path === '/sitemap.xml');
  try {
    const { code, stderr, stdout } = await runCheck(stub.base);

    assert.equal(code, 1, 'a persistent 503 is a broken deployment, not a hiccup');
    assert.match(stdout, /still answered HTTP 503 after 2 attempts/);
    assert.match(
      stderr,
      /::error::.*sitemap\.xml is advertised by robots\.txt but did not answer 200: 503 \/sitemap\.xml/,
      `the failure must name what was actually broken:\n${stderr}`,
    );
  } finally {
    await stub.close();
  }
});

test('a retired desk address passes the release when it redirects to its merge target', async () => {
  // Run #95 went red on exactly this: the university desk merged into campus, so
  // /category/university/ permanentRedirects to /category/campus/. A freshly deployed
  // build prerenders the front page before the migration applies, so the walk can still
  // sample the old link from a stale homepage seconds after deploy — that redirect is the
  // intended behaviour, not a broken canonical.
  const stub = await startStub(() => false, [ARTICLE, SECTION, '/category/university/', '/statistics/']);
  try {
    const { code, stdout, stderr } = await runCheck(stub.base);

    assert.equal(code, 0, `the retired redirect failed the release:\n${stderr}`);
    assert.match(stdout, /\/category\/university\/ retired, redirects to \/category\/campus\//);
    assert.match(stdout, /Live routes OK/);
  } finally {
    await stub.close();
  }
});
