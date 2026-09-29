// NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
// the Supabase credentials have to be present in the environment when
// `opennextjs-cloudflare build` runs. They are credentials, so they are not
// committed: CI injects them from the repository variables (or secrets) into
// an untracked .env.production file immediately before the build, in an
// ephemeral workspace. Next.js loads .env.production automatically during
// `next build`, and opennextjs-cloudflare invokes `next build` itself.
//
// Usage: node scripts/inject-worker-vars.mjs [--env preview]
//   Default writes .env.production. --env preview writes .env.preview,
//   which is NOT loaded by Next.js automatically — the preview job passes the
//   same values as step env so both build and runtime agree on demo mode.
//
// Refuses to run outside CI unless --force is passed, so a local run never
// leaves credentials on disk where a later `git add -A` could sweep them up.
import { writeFileSync } from 'node:fs';

const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];

if (!process.env.CI && !process.argv.includes('--force')) {
  console.error(
    'Refusing to write credentials into an env file outside CI.\n' +
      'Run with --force only if you are deploying by hand and will not commit the result.',
  );
  process.exit(1);
}

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    `Cannot deploy the portal without ${missing.join(' and ')}.\n` +
      'Set them as GitHub repository variables (Settings -> Secrets and variables -> Actions -> Variables),\n' +
      'or as repository secrets with the same names. Without them every visitor gets an empty\n' +
      '/api/config: no sign-in and no article content.',
  );
  process.exit(1);
}

const preview = process.argv.includes('--env') && process.argv[process.argv.indexOf('--env') + 1] === 'preview';
const target = preview ? '.env.preview' : '.env.production';
const lines = REQUIRED.map((name) => `${name}=${process.env[name]}`);
writeFileSync(target, `${lines.join('\n')}\n`);

console.log(`Wrote ${REQUIRED.join(', ')} to ${target} for this deployment only.`);
