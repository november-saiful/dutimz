#!/usr/bin/env node
// Free manual push sender — runs in GitHub Actions (Node 20), NOT on Cloudflare.
// Sends FCM topic messages via firebase-admin (HTTP v1) + manages topic subscriptions.
// Cost: $0 (FCM no-cost, Actions free quota, no Blaze/Cloud Functions needed).
//
//   FIREBASE_SERVICE_ACCOUNT_JSON='{...}' node scripts/send-push.mjs send \
//     --topic breaking --title "T" --body "B" --link "/news/slug"
//   FIREBASE_SERVICE_ACCOUNT_JSON='{...}' node scripts/send-push.mjs subscribe \
//     --topic breaking --tokens tok1,tok2
//   FIREBASE_SERVICE_ACCOUNT_JSON='{...}' SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/send-push.mjs sync --topic breaking
//
// Registering tokens to topics via `sync` is how topic-based delivery works:
// browsers save tokens to Supabase; this script subscribes them to FCM topics.

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const command = args[0];
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : (args[i + 1] ?? "");
};

async function admin() {
  const { default: adminSdk } = await import("firebase-admin");
  if (!adminSdk.apps.length) {
    const raw =
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      (process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")
        : "");
    if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON secret");
    adminSdk.initializeApp({ credential: adminSdk.credential.cert(JSON.parse(raw)) });
  }
  return adminSdk;
}

const ALLOWED_TOPICS = ["announcements", "breaking", "sports", "technology"];

async function cmdSend() {
  const topic = flag("topic") || "breaking";
  const title = flag("title") || "Dutimz update";
  const body = flag("body") || "";
  const link = flag("link") || "/";
  if (!ALLOWED_TOPICS.includes(topic)) throw new Error(`Unknown topic: ${topic}`);
  const sdk = await admin();
  const id = await sdk.messaging().send({
    topic,
    notification: { title, body },
    webpush: { fcmOptions: { link }, notification: { icon: "/icons/icon-192.png" } },
    data: { link },
  });
  console.log(`Sent to topic "${topic}": ${id}`);
}

async function cmdSubscribe() {
  const topic = flag("topic");
  const tokens = (flag("tokens") || "").split(",").map((t) => t.trim()).filter(Boolean);
  if (!topic || !tokens.length) throw new Error("Usage: subscribe --topic T --tokens tok1,tok2");
  if (!ALLOWED_TOPICS.includes(topic)) throw new Error(`Unknown topic: ${topic}`);
  const sdk = await admin();
  const res = await sdk.messaging().subscribeToTopic(tokens, topic);
  console.log(`Subscribed ${res.successCount}/${tokens.length} to "${topic}"`);
  if (res.failureCount) console.log(JSON.stringify(res.errors, null, 2));
}

// Subscribe EVERY stored token to a topic (e.g. all users -> announcements).
async function cmdSync() {
  const topic = flag("topic");
  if (!topic) throw new Error("Usage: sync --topic T");
  if (!ALLOWED_TOPICS.includes(topic)) throw new Error(`Unknown topic: ${topic}`);
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("sync needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY secrets");
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=token`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);
  const rows = await res.json();
  const tokens = rows.map((r) => r.token).filter(Boolean);
  if (!tokens.length) return console.log("No tokens stored yet.");
  const sdk = await admin();
  let ok = 0;
  for (let i = 0; i < tokens.length; i += 500) {
    const r = await sdk.messaging().subscribeToTopic(tokens.slice(i, i + 500), topic);
    ok += r.successCount;
  }
  console.log(`Synced ${ok}/${tokens.length} tokens to "${topic}"`);
}

if (command === "send") await cmdSend();
else if (command === "subscribe") await cmdSubscribe();
else if (command === "sync") await cmdSync();
else {
  console.error("Usage: send-push.mjs <send|subscribe|sync> [flags]");
  process.exit(1);
}
