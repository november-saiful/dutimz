// Cloudflare Pages treats wrangler.jsonc as the source of truth for the fields it
// defines, and a deployment reads its configuration from `env.production` rather than
// from the dashboard. Values added in the dashboard under a *different* key are
// therefore shadowed at runtime: `wrangler pages download config dutimz` showed the
// dashboard's SUPABASE_URL / SUPABASE_ANON_KEY surviving only in the inherited default
// block, while production served `{"supabaseUrl":"","supabaseAnonKey":""}`.
//
// So the two Supabase values have to be present in this file when the deployment is
// created. They are credentials, so they are not committed: CI injects them from the
// repository variables (or secrets) immediately before `wrangler pages deploy`, in an
// ephemeral workspace. Everything else the deployment needs is already in the file.
import { readFileSync, writeFileSync } from 'node:fs';

const CONFIG_PATH = new URL('../wrangler.jsonc', import.meta.url);
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

if (!process.env.CI && !process.argv.includes('--force')) {
  console.error(
    'Refusing to write credentials into a tracked file outside CI.\n' +
      'Run with --force only if you are deploying by hand and will not commit the result.',
  );
  process.exit(1);
}

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    `Cannot deploy a Pages project without ${missing.join(' and ')}.\n` +
      'Set them as GitHub repository variables (Settings -> Secrets and variables -> Actions -> Variables),\n' +
      'or as repository secrets with the same names. Without them every visitor gets an empty\n' +
      '/api/config.json: no sign-in and no article content.',
  );
  process.exit(1);
}

// This script rewrites the file, so it has to be strict JSON: a comment would be silently
// lost rather than preserved here. Keep the commentary in README.md instead.
let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
} catch (error) {
  console.error(
    `wrangler.jsonc could not be read as strict JSON (${error.message}).\n` +
      'This script rewrites the file, so comments and trailing commas cannot be carried through.',
  );
  process.exit(1);
}
config.vars = { ...config.vars };
for (const name of REQUIRED) {
  config.vars[name] = process.env[name];
}
writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);

console.log(`Injected ${REQUIRED.join(', ')} into wrangler.jsonc for this deployment only.`);
console.log(`Pages variables now defined: ${Object.keys(config.vars).join(', ')}`);
