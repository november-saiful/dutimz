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
const REQUIRED = ['supabaseUrl', 'supabaseAnonKey', 'mediaUrl'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers: { 'cache-control': 'no-cache', ...headers } });
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
      { headers: { authorization: `Bearer ${token}` } },
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

async function confirmConfiguration(config) {
  console.log(`Live configuration OK: ${config.supabaseUrl} with media at ${config.mediaUrl}`);

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
    return confirmConfiguration(site.config);
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
      return confirmConfiguration(worker.config);
    }
  }

  for (const problem of site.problems) {
    console.error(`::error::${problem}`);
  }
  console.error(`::error::${siteUrl}/api/config never reported the deployed configuration`);
  return 1;
}

process.exitCode = await main();
