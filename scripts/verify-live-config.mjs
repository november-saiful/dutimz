// Release smoke check. A deployment becomes reachable before its configuration does:
// immediately after `wrangler pages deploy` finished, /api/config.json answered 200 with the
// *previous* deployment's body, so a check that only waited for a response reported the
// freshly injected Supabase values as missing. Poll for the expected content instead, and
// report what was actually received when the deployment never converges.
//
// This sets process.exitCode rather than calling process.exit(): exiting while the HTTP
// keep-alive sockets are still closing aborts the process on Windows and reports a bogus
// exit code, which is exactly the sort of noise a smoke check must not emit.
const siteUrl = process.env.SITE_URL ?? 'https://dutimz.com';
const attempts = Number(process.env.CONFIG_ATTEMPTS ?? 20);
const delayMs = Number(process.env.CONFIG_DELAY_MS ?? 6000);
const REQUIRED = ['supabaseUrl', 'supabaseAnonKey', 'mediaUrl'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
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

async function main() {
  try {
    const portal = await fetchText(`${siteUrl}/`);
    console.log(`Portal HTTP 200 (${portal.length} bytes of HTML)`);
  } catch (error) {
    console.error(`::error::the live portal did not respond: ${error.message}`);
    return 1;
  }

  let lastProblems = ['no attempt was made'];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const config = JSON.parse(await fetchText(`${siteUrl}/api/config.json`));
      lastProblems = problemsWith(config);
      if (lastProblems.length === 0) {
        console.log(`Live configuration OK: ${config.supabaseUrl} with media at ${config.mediaUrl}`);
        return 0;
      }
    } catch (error) {
      lastProblems = [error.message];
    }

    console.log(`Attempt ${attempt}/${attempts} is not serving this deployment yet: ${lastProblems.join('; ')}`);
    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  for (const problem of lastProblems) {
    console.error(`::error::${problem}`);
  }
  console.error(`::error::${siteUrl}/api/config.json never reported the deployed configuration`);
  return 1;
}

process.exitCode = await main();
