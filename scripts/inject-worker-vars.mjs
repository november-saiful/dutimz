// NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
// the Supabase credentials have to be present in the environment when
// `opennextjs-cloudflare build` runs. They are credentials, so they are not
// committed: CI injects them from the repository variables (or secrets) into
// an untracked .env.production file immediately before the build, in an
// ephemeral workspace. Next.js loads .env.production automatically during
// `next build`, and opennextjs-cloudflare invokes `next build` itself.
//
// Usage: node scripts/inject-worker-vars.mjs [--env preview]
//   Default writes .env.production and fails when the credentials are absent.
//   --env preview writes .env.preview (not loaded automatically by Next.js) and treats
//   absent credentials as "build a demo preview" instead of an error, because a preview
//   must never carry the production database credentials.
//
// Refuses to run outside CI unless --force is passed, so a local run never
// leaves credentials on disk where a later `git add -A` could sweep them up.
import { writeFileSync } from 'node:fs';

const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];

// Public Firebase web config for browser push (FCM). Optional: the site builds
// and serves fine without push, so absent values warn instead of failing.
// When present they are inlined into the client bundle (NEXT_PUBLIC_*).
const OPTIONAL = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_VAPID_KEY',
];

if (!process.env.CI && !process.argv.includes('--force')) {
  console.error(
    'Refusing to write credentials into an env file outside CI.\n' +
      'Run with --force only if you are deploying by hand and will not commit the result.',
  );
  process.exit(1);
}

const preview = process.argv.includes('--env') && process.argv[process.argv.indexOf('--env') + 1] === 'preview';

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  if (preview) {
    // A preview deployment deliberately runs without credentials: it serves illustrative
    // content in demo mode so an unmerged branch can never read the production database.
    // There is nothing to inject, and failing here would just turn every pull request red.
    console.log(
      `No ${missing.join(' or ')} was provided, so this preview will be built in demo mode.`,
    );
    process.exit(0);
  }
  console.error(
    `Cannot deploy the portal without ${missing.join(' and ')}.\n` +
      'Set them as GitHub repository variables (Settings -> Secrets and variables -> Actions -> Variables),\n' +
      'or as repository secrets with the same names. Without them every visitor gets an empty\n' +
      '/api/config: no sign-in and no article content.',
  );
  process.exit(1);
}

const present = OPTIONAL.filter((name) => process.env[name]);
if (present.length > 0 && present.length < OPTIONAL.length) {
  console.error(
    'Incomplete Firebase web config: have ' + present.join(', ') + ' but missing ' +
      OPTIONAL.filter((name) => !process.env[name]).join(', ') + '. Push subscribe will fail; ' +
      'set all six as GitHub repository variables or none.',
  );
  process.exit(1);
}

const target = preview ? '.env.preview' : '.env.production';
const lines = [...REQUIRED, ...present].map((name) => `${name}=${process.env[name]}`);
writeFileSync(target, `${lines.join('\n')}\n`);

console.log(`Wrote ${[...REQUIRED, ...present].join(', ')} to ${target} for this deployment only.`);
