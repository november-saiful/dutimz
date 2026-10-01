// The incremental cache needs its R2 bucket to already exist: `wrangler deploy` binds a
// bucket by name, it does not create one, so a fresh environment would otherwise fail the
// release on a missing bucket — the same shape of manual-dashboard step that the router
// bindings were moved out of the dashboard to avoid.
//
// The bucket names are read from wrangler.jsonc rather than repeated here, so the file that
// binds a bucket stays the only place that names it.
//
// Usage: node scripts/ensure-cache-buckets.mjs [--env preview]
//   Default ensures the production buckets; --env preview ensures the ones env.preview binds.
//
// Creating an empty bucket is idempotent, so a re-run is always safe: an existing bucket is
// reported and skipped.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * wrangler.jsonc is JSON with comments. Stripping whole-line `//` comments is not enough to
 * parse it safely — a trailing comment after a value, or a `//` inside a string such as
 * "https://dutimz.com", would both defeat a naive sweep — so this walks the text and drops
 * only the comments that start outside a quoted string.
 */
export function parseJsonc(text) {
  let out = '';
  let inString = false;
  let inLineComment = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        out += char;
      }
      continue;
    }
    if (inString) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }
    out += char;
  }
  return JSON.parse(out);
}

/** The buckets the given environment binds, in declaration order. */
export function cacheBuckets(config, environment) {
  const section =
    environment === 'preview' ? (config.env?.preview ?? {}) : config;
  return (section.r2_buckets ?? []).map((entry) => entry.bucket_name);
}

function main() {
  if (!process.env.CI && !process.argv.includes('--force')) {
    console.error(
      'Refusing to create buckets outside CI. This needs Cloudflare credentials and\n' +
        'changes the account; run with --force only if that is what you intend.',
    );
    process.exit(1);
  }

  const envIndex = process.argv.indexOf('--env');
  const environment = envIndex === -1 ? 'production' : process.argv[envIndex + 1];

  const config = parseJsonc(readFileSync('wrangler.jsonc', 'utf8'));
  const buckets = cacheBuckets(config, environment);

  if (buckets.length === 0) {
    console.log(`No R2 buckets are bound for ${environment}; nothing to create.`);
    return;
  }

  for (const bucket of buckets) {
    let output = '';
    try {
      output = execFileSync(
        // execFileSync does not go through a shell, so the Windows launcher is named
        // explicitly rather than left to PATH resolution.
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['wrangler', 'r2', 'bucket', 'create', bucket],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      console.log(`Created R2 bucket ${bucket}.`);
    } catch (error) {
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
      // The only acceptable failure is "it is already there", which Cloudflare reports as
      // code 10004. Anything else — a bad token, a wrong account id — has to fail the run
      // rather than be swallowed, or the release would continue against a missing bucket.
      if (/already exists|code:\s*10004/i.test(output)) {
        console.log(`R2 bucket ${bucket} already exists; leaving it as it is.`);
        continue;
      }
      console.error(`Could not create R2 bucket ${bucket}:`);
      console.error(output.trim());
      process.exit(1);
    }
  }
}

// Only run when invoked directly, so the helpers above can be imported (and tested) without
// creating anything.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
