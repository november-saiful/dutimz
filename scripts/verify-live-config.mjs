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
// This sets process.exitCode rather than calling process.exit(): exiting while the HTTP
// keep-alive sockets are still closing aborts the process on Windows and reports a bogus
// exit code, which is exactly the sort of noise a smoke check must not emit.
const siteUrl = process.env.SITE_URL ?? 'https://dutimz.com';
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

async function main() {
  try {
    const portal = await fetchText(`${siteUrl}/`);
    console.log(`Portal HTTP 200 (${portal.length} bytes of HTML)`);
  } catch (error) {
    console.error(`::error::the live portal did not respond: ${error.message}`);
    return 1;
  }

  let lastProblems = ['no attempt was made'];
  let config;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      config = JSON.parse(await fetchText(`${siteUrl}/api/config.json`));
      lastProblems = problemsWith(config);
      if (lastProblems.length === 0) {
        break;
      }
    } catch (error) {
      lastProblems = [error.message];
    }

    console.log(`Attempt ${attempt}/${attempts} is not serving this deployment yet: ${lastProblems.join('; ')}`);
    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  if (lastProblems.length > 0) {
    for (const problem of lastProblems) {
      console.error(`::error::${problem}`);
    }
    console.error(`::error::${siteUrl}/api/config.json never reported the deployed configuration`);
    return 1;
  }

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

process.exitCode = await main();
