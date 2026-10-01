// Release smoke check. A deployment becomes reachable before its configuration does:
// immediately after `wrangler pages deploy` finished, /api/config.json answered 200 with the
// *previous* deployment's body, so a check that only waited for a response reported the
// freshly injected Supabase values as missing. Poll for the expected content instead, and
// report what was actually received when the deployment never converges.
//
// The published configuration is then used to make the same anonymous requests a signed-out
// visitor's browser makes. That is deliberate: a table whose row level security policy calls a
// function the `anon` role cannot execute refuses the whole query (42501) rather than
// returning fewer rows, which is invisible to any check that only looks at the site's HTML.
//
// Finally the deployment is walked as a visitor would walk it. Three failures have already
// shipped past every other check because they only exist once the app is really served by
// Cloudflare: public/_redirects and Next.js disagreed about trailing slashes and looped
// forever on every article, the asset layer served some pages while the Worker served others
// so only some carried the public/_headers guarantees, and the public hostname was attached
// to a retired project. All three are ordinary HTTP behaviour, so all three are asserted here.
//
// The page cache is checked for a real hit as well. The adapter's incremental cache and queue
// both default to no-ops, so a deployment can pass every other check here while re-rendering
// every public page — even the fully static ones — from the database on every single request.
//
// The deployment is checked on the public domain first, and then — when that domain is still
// pointed at a previous project, which is a manual Cloudflare step rather than a build
// failure — on the address Cloudflare gives the Worker itself. Failing to reach the Worker
// there is still a release failure; the apex simply not being switched over yet is a warning
// that names the exact action, so a red release always means something is actually broken.
//
// This sets process.exitCode rather than calling process.exit(): exiting while the HTTP
// keep-alive sockets are still closing aborts the process on Windows and reports a bogus
// exit code, which is exactly the sort of noise a smoke check must not emit.
const siteUrl = process.env.SITE_URL ?? 'https://dutimz.com';
const workerName = process.env.WORKER_NAME ?? 'dutimz';
const attempts = Number(process.env.CONFIG_ATTEMPTS ?? 20);
const delayMs = Number(process.env.CONFIG_DELAY_MS ?? 6000);
const maxHops = Number(process.env.MAX_HOPS ?? 5);
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS ?? 15000);
const cacheAttempts = Number(process.env.CACHE_ATTEMPTS ?? 4);
const cacheDelayMs = Number(process.env.CACHE_DELAY_MS ?? 2000);
const REQUIRED = ['supabaseUrl', 'supabaseAnonKey', 'mediaUrl'];

// Every HTML page the site serves has to carry these. public/_headers applies them to the
// files the asset layer serves and middleware applies them to everything the Worker renders,
// so a page served through one layer without the other is a regression, not a detail.
const REQUIRED_HEADERS = [
  'x-content-type-options',
  'referrer-policy',
  'x-frame-options',
  'permissions-policy',
];

// Routes whose canonical URL is known here, including the shapes that export a canonical of
// their own (`/statistics/`, `/about/`, `/search/`). Each one must answer 200 with no redirect
// at all: a canonical URL that redirects is how the trailing-slash loop started.
const CANONICAL_PATHS = [
  '/',
  '/statistics/',
  '/search/',
  '/saved/',
  '/about/',
  '/guidelines/',
  '/corrections/',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url) {
  return fetch(url, {
    redirect: 'manual',
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
}

/**
 * A plain navigation, with no `cache-control` request header at all.
 *
 * The cached routes are checked with this rather than with `request()` above: that helper
 * deliberately sends `cache-control: no-cache` to defeat any intermediary cache while the
 * route checks walk redirects, and reusing it here would risk asserting the absence of the
 * very caching this check exists to prove.
 */
async function visit(url) {
  return fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, {
    headers: { 'cache-control': 'no-cache', ...headers },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.text();
}

function problemsWith(config) {
  const problems = REQUIRED.filter((key) => !config[key]).map(
    (key) => `${key} is empty in /api/config.json, so the deployment is missing that variable`,
  );
  if (config.demoMode) {
    problems.push('the live site is serving demo content instead of the database');
  }
  return problems;
}

// Everything the browser needs to talk to Supabase, used the way the browser uses it.
async function anonymousRead(config, path) {
  const url = `${config.supabaseUrl}/rest/v1/${path}`;
  const response = await fetch(url, {
    headers: {
      apikey: config.supabaseAnonKey,
      authorization: `Bearer ${config.supabaseAnonKey}`,
      'cache-control': 'no-cache',
    },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  return { url, status: response.status, body: (await response.text()).slice(0, 160) };
}

async function visitorProblems(config) {
  const problems = [];
  for (const [label, path] of [
    ['published articles', 'articles?select=slug&limit=1'],
    ['section list', 'categories?select=slug&limit=1'],
  ]) {
    const result = await anonymousRead(config, path);
    if (result.status !== 200) {
      problems.push(`a signed-out visitor cannot read the ${label} (HTTP ${result.status}: ${result.body})`);
    }
  }

  const ledger = await anonymousRead(config, 'earnings_ledger?select=amount_tk&limit=1');
  if (ledger.status !== 401 && ledger.status !== 403) {
    problems.push(`the earnings ledger is readable by a signed-out visitor (HTTP ${ledger.status})`);
  }
  return problems;
}

/**
 * Walk redirects one hop at a time, so a loop is a reportable failure rather than a hang or a
 * generic "too many redirects" from the HTTP client.
 */
async function walk(startUrl) {
  const chain = [];
  const seen = new Set();
  let url = startUrl;
  for (let hop = 0; hop <= maxHops; hop += 1) {
    if (seen.has(url)) return { chain, loop: true };
    seen.add(url);

    const response = await request(url);
    const location = response.headers.get('location') ?? undefined;
    chain.push({ url, status: response.status, location });

    if (response.status < 300 || response.status >= 400) {
      return { chain, loop: false, response, final: url };
    }
    if (!location) {
      return { chain, loop: false, response, final: url };
    }
    url = new URL(location, url).toString();
  }
  return { chain, loop: true };
}

const describeChain = (chain) =>
  chain.map((hop) => `${hop.status} ${new URL(hop.url).pathname}`).join(' -> ');

async function homeLinks(base) {
  try {
    const html = await fetchText(`${base}/`);
    return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
  } catch {
    return [];
  }
}

/**
 * Real article and section paths taken from the home page, mapped to the trailing-slash
 * canonical their own `alternates.canonical` declares. Sampling live links means the check
 * covers whatever the templates currently emit rather than a list that drifts.
 */
function canonicalSamples(links) {
  const samples = new Map();
  for (const href of links) {
    const match = /^\/(news|category)\/([^/?#"]+)\/?$/.exec(href);
    if (!match) continue;
    const plain = `/${match[1]}/${match[2]}`;
    if (!samples.has(`${plain}/`)) samples.set(`${plain}/`, plain);
  }
  return samples;
}

/** The `www` host for a bare apex, or null when this deployment has no such twin. */
function wwwHostFor(base) {
  const { protocol, hostname } = new URL(base);
  if (hostname.startsWith('www.') || hostname.endsWith('.workers.dev') || !hostname.includes('.')) {
    return null;
  }
  return `${protocol}//www.${hostname}/`;
}

/**
 * A route that exports `revalidate` has to be served from the incremental cache.
 *
 * This check exists because it silently was not. The adapter's incremental cache and queue
 * both default to no-op implementations, so the site answered `x-nextjs-cache: MISS` on every
 * request and the article route shipped `Cache-Control: no-store` — the whole newsroom
 * re-reading the database for every page view — while every other check in this file, which
 * only ever asked whether a response was 200, passed.
 */
async function cacheProblems(base) {
  const problems = [];
  const samples = [...canonicalSamples(await homeLinks(base)).keys()];

  // `/about/` is fully static (`initialRevalidateSeconds: false`), so once it is in the cache
  // it is always a hit and never goes stale. That makes it the deterministic proof, with no
  // dependency on the revalidation queue doing its work in the background. The routes that
  // export `revalidate` may legitimately answer STALE — the entry exists and was read, it is
  // simply due to be regenerated — so they are held to a weaker bar: never MISS.
  const targets = [
    { path: '/about/', allowStale: false },
    { path: '/', allowStale: true },
    ...(samples[0] ? [{ path: samples[0], allowStale: true }] : []),
  ];

  for (const { path, allowStale } of targets) {
    const url = new URL(path, base).toString();
    const observed = new Set();
    let verdict = null;

    // The first visit renders the page and stores it; the second is the one that must be
    // served from the cache. Retried because a freshly deployed build starts with an empty
    // cache and the request that fills it may still be in flight when the next one arrives.
    for (let attempt = 1; attempt <= cacheAttempts && !verdict; attempt += 1) {
      for (let visitNumber = 0; visitNumber < 2; visitNumber += 1) {
        const response = await visit(url);
        await response.arrayBuffer().catch(() => undefined);
        if (visitNumber === 0) continue;
        const state = response.headers.get('x-nextjs-cache') ?? 'absent';
        observed.add(state);
        if (state === 'HIT' || (allowStale && state === 'STALE')) verdict = state;
      }
      if (!verdict && attempt < cacheAttempts) await sleep(cacheDelayMs);
    }

    if (verdict) {
      console.log(`  ${path} is served from the incremental cache (${verdict})`);
    } else {
      problems.push(
        `${path} is never served from the incremental cache (x-nextjs-cache: ${[...observed].join(', ')})` +
          (allowStale ? '' : ', and this route is fully static so it has no reason to miss') +
          ', so every visit re-renders it from the database; the portal Worker is most likely missing ' +
          'its NEXT_INC_CACHE_R2_BUCKET or NEXT_CACHE_DO_QUEUE binding.',
      );
    }
  }

  return problems;
}

async function routeProblems(base) {
  const problems = [];
  const samples = canonicalSamples(await homeLinks(base));

  console.log(`Walking ${CANONICAL_PATHS.length + samples.size} canonical URLs on ${base}`);

  const checkCanonical = async (path) => {
    const { chain, loop, response } = await walk(new URL(path, base).toString());
    if (loop) {
      problems.push(`redirect loop at ${path}: ${describeChain(chain)}`);
      return;
    }
    if (chain.length > 1) {
      problems.push(`${path} is a canonical URL but redirects: ${describeChain(chain)}`);
      return;
    }
    if (response.status !== 200) {
      problems.push(`${path} answered HTTP ${response.status}`);
      return;
    }
    const missing = REQUIRED_HEADERS.filter((name) => !response.headers.get(name));
    if (missing.length > 0) {
      problems.push(`${path} is served without ${missing.join(', ')}`);
      return;
    }
    console.log(`  ${path} 200, canonical, headers present`);
  };

  for (const path of CANONICAL_PATHS) {
    await checkCanonical(path);
  }

  // The shapes that looped: a live article and a live section, both ways round.
  for (const [canonical, plain] of samples) {
    await checkCanonical(canonical);

    const { chain, loop, response, final } = await walk(new URL(plain, base).toString());
    if (loop) {
      problems.push(`redirect loop from ${plain}: ${describeChain(chain)}`);
    } else if (response.status !== 200) {
      problems.push(`${plain} ends at HTTP ${response.status} after ${chain.length - 1} redirect(s)`);
    } else if (new URL(final).pathname !== canonical) {
      problems.push(`${plain} should settle on ${canonical} but landed on ${new URL(final).pathname}`);
    } else if (chain.length > 2) {
      problems.push(`${plain} takes ${chain.length - 1} redirects to reach ${canonical}: ${describeChain(chain)}`);
    } else {
      console.log(`  ${plain} -> ${canonical} in ${chain.length - 1} redirect(s)`);
    }
  }

  // `www` must hand the visitor to the apex, keeping the path they asked for. Only the first
  // hop is judged: following the redirect onwards lands on a 200, which is the point of it.
  const wwwBase = wwwHostFor(base);
  if (wwwBase) {
    const apexHost = new URL(base).hostname;
    for (const path of ['/', '/statistics/']) {
      const from = new URL(path, wwwBase).toString();
      try {
        const { chain, loop } = await walk(from);
        const first = chain[0];
        if (loop) {
          problems.push(`redirect loop at ${from}: ${describeChain(chain)}`);
        } else if (first.status < 300) {
          problems.push(`${from} serves the site itself (HTTP ${first.status}) instead of redirecting to ${apexHost}, so one page has two addresses`);
        } else if (!first.location) {
          problems.push(`${from} answered HTTP ${first.status} without a Location pointing at ${apexHost}`);
        } else {
          const destination = new URL(first.location, from);
          if (destination.hostname !== apexHost) {
            problems.push(`${from} redirects to ${destination.hostname} instead of ${apexHost}`);
          } else if (destination.pathname !== path) {
            problems.push(`${from} redirects to ${destination.pathname} instead of keeping the requested path`);
          } else {
            console.log(`  ${from} ${first.status} -> ${destination.hostname}${destination.pathname}`);
          }
        }
      } catch (error) {
        console.log(`  ${from} could not be reached (${error.message}); not checked`);
        break;
      }
    }
  }

  // Whatever robots.txt advertises has to exist. The previous site went on advertising a
  // sitemap that every path answered 404 for, and nothing noticed because nothing looked.
  try {
    const robots = await fetchText(`${base}/robots.txt`);
    const advertised = [...robots.matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim)].map(
      (match) => match[1],
    );
    if (advertised.length === 0) {
      problems.push(`${base}/robots.txt advertises no sitemap`);
    }

    for (const declaration of advertised) {
      // The declaration names the public host; while checking the Worker's own host, ask there.
      const target = new URL(new URL(declaration).pathname, base).toString();
      const { chain, loop, response } = await walk(target);
      if (loop || response.status !== 200) {
        problems.push(
          `${target} is advertised by robots.txt but did not answer 200: ${describeChain(chain)}`,
        );
        continue;
      }

      const xml = await response.text();
      const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
      if (!/<(urlset|sitemapindex)\b/.test(xml)) {
        problems.push(`${target} is advertised by robots.txt but is not a sitemap`);
      } else if (locations.length === 0) {
        problems.push(`${target} is advertised by robots.txt but lists no URLs`);
      } else {
        console.log(`  ${target} advertises ${locations.length} URLs`);
        // One of them has to be a real page, in the canonical shape the site links to.
        const sample = locations
          .map((location) => new URL(location).pathname)
          .find((path) => path.startsWith('/news/'));
        if (sample) await checkCanonical(sample);
      }
    }
  } catch (error) {
    problems.push(`${base}/robots.txt could not be read (${error.message})`);
  }

  return problems;
}

/**
 * The address Cloudflare serves the Worker on, so a release can be verified even while the
 * public domain still points elsewhere. WORKER_URL overrides it; otherwise ask the API,
 * which needs no extra configuration because the release already holds these credentials.
 */
async function workerUrl() {
  if (process.env.WORKER_URL) {
    return process.env.WORKER_URL.replace(/\/+$/, '');
  }
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) return null;
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
      { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(requestTimeoutMs) },
    );
    if (!response.ok) {
      console.log(`Could not resolve the Worker hostname (HTTP ${response.status}); checking only ${siteUrl}.`);
      return null;
    }
    const { result } = await response.json();
    return result?.subdomain ? `https://${workerName}.${result.subdomain}.workers.dev` : null;
  } catch (error) {
    console.log(`Could not resolve the Worker hostname (${error.message}); checking only ${siteUrl}.`);
    return null;
  }
}

/** Wait until `base` serves this deployment's own configuration. */
async function probeDeployment(base) {
  try {
    const portal = await fetchText(`${base}/`);
    console.log(`${base} answered HTTP 200 (${portal.length} bytes of HTML)`);
  } catch (error) {
    return { ok: false, config: null, problems: [`${base} did not respond: ${error.message}`] };
  }

  let problems = ['no attempt was made'];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const config = JSON.parse(await fetchText(`${base}/api/config`));
      problems = problemsWith(config);
      if (problems.length === 0) {
        return { ok: true, config, problems: [] };
      }
    } catch (error) {
      problems = [error.message];
    }

    console.log(`Attempt ${attempt}/${attempts}: ${base}/api/config is not serving this deployment yet: ${problems.join('; ')}`);
    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  return { ok: false, config: null, problems };
}

async function confirmDeployment(base, config) {
  console.log(`Live configuration OK: ${config.supabaseUrl} with media at ${config.mediaUrl}`);

  const routeIssues = await routeProblems(base);
  if (routeIssues.length > 0) {
    for (const problem of routeIssues) {
      console.error(`::error::${problem}`);
    }
    return 1;
  }
  console.log(`Live routes OK: canonical URLs resolve directly, no redirect loops, headers present.`);

  const cacheIssues = await cacheProblems(base);
  if (cacheIssues.length > 0) {
    for (const problem of cacheIssues) {
      console.error(`::error::${problem}`);
    }
    return 1;
  }
  console.log('Live caching OK: revalidated routes are served from the incremental cache.');

  const visitorIssues = await visitorProblems(config);
  if (visitorIssues.length > 0) {
    for (const problem of visitorIssues) {
      console.error(`::error::${problem}`);
    }
    return 1;
  }

  console.log('Anonymous access OK: the published feed, search sections and RLS denials all behave.');
  return 0;
}

async function main() {
  const site = await probeDeployment(siteUrl);
  if (site.ok) {
    return confirmDeployment(siteUrl, site.config);
  }

  const fallback = await workerUrl();
  if (fallback && fallback !== siteUrl) {
    const worker = await probeDeployment(fallback);
    if (worker.ok) {
      console.log(
        `::warning::${siteUrl} is still serving a previous deployment, but this release is live and verified at ${fallback}. ` +
          `To publish it on the public domain, remove ${siteUrl} from the Cloudflare Pages project and add it as a Custom Domain on the ${workerName} Worker ` +
          '(Workers & Pages -> the Pages project -> Custom domains -> remove, then the Worker -> Settings -> Domains & Routes -> Add -> Custom Domain). ' +
          'Keep the www redirect pointed at the Worker as well.',
      );
      return confirmDeployment(fallback, worker.config);
    }
  }

  for (const problem of site.problems) {
    console.error(`::error::${problem}`);
  }
  console.error(`::error::${siteUrl}/api/config never reported the deployed configuration`);
  return 1;
}

process.exitCode = await main();
