// Fills the __FIREBASE_*__ placeholders in public/firebase-messaging-sw.js
// from the environment (GitHub vars in CI, .env.local values locally).
// The service worker is a static file served from / and cannot read
// process.env at runtime, so the public Firebase web config is inlined
// at build time. These are PUBLIC client identifiers, not secrets.
// Usage: NEXT_PUBLIC_FIREBASE_*=... node scripts/inject-sw-config.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'public/firebase-messaging-sw.js';
const MAP = {
  __FIREBASE_API_KEY__: 'NEXT_PUBLIC_FIREBASE_API_KEY',
  __FIREBASE_AUTH_DOMAIN__: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  __FIREBASE_PROJECT_ID__: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  __FIREBASE_MESSAGING_SENDER_ID__: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  __FIREBASE_APP_ID__: 'NEXT_PUBLIC_FIREBASE_APP_ID',
};

const checkOnly = process.argv.includes('--check');
let src = readFileSync(FILE, 'utf8');
const missing = Object.values(MAP).filter((name) => !process.env[name]);
if (missing.length === Object.values(MAP).length) {
  console.log('No Firebase web config provided; push notifications stay disabled in this build.');
  process.exit(0);
}
if (missing.length > 0) {
  if (checkOnly) {
    console.log(`SW config placeholders present; missing env: ${missing.join(', ')}`);
    process.exit(0);
  }
  console.error(
    `Cannot configure the push service worker without ${missing.join(' and ')}.\n` +
      'Set them as GitHub repository variables (Settings -> Secrets and variables -> Actions -> Variables).',
  );
  process.exit(1);
}
for (const [placeholder, envName] of Object.entries(MAP)) {
  src = src.replaceAll(placeholder, process.env[envName]);
}
if (checkOnly) {
  const remaining = (src.match(/__FIREBASE_[A-Z_]+__/g) || []).length;
  console.log(remaining === 0 ? 'SW config fully inlined.' : `Placeholders remaining: ${remaining}`);
  process.exit(0);
}
writeFileSync(FILE, src);
console.log('Inlined Firebase web config into public/firebase-messaging-sw.js for this deployment only.');
