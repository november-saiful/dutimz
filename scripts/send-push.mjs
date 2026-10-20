#!/usr/bin/env node
// Free manual push sender — runs in GitHub Actions (Node 20), NOT on Cloudflare.
// Delivers per-topic via firebase-admin multicast (HTTP v1), reading each
// device's checked topics from Supabase. Cost: $0 (FCM no-cost, Actions free
// quota, no Blaze/Cloud Functions needed).
//
//   FIREBASE_SERVICE_ACCOUNT_JSON='{...}' SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/send-push.mjs send --topic breaking --title "T" --body "B" --link "/news/slug"
//
// Audience for a topic send: devices that ticked the topic in the bell popup
// (push_topic_prefs) PLUS legacy devices that subscribed before topics
// existed and never picked any (no pref rows at all — treated as "everything").
// Tokens FCM reports dead are pruned from both tables on every send.

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

function supabase() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("send needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY secrets");
  }
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
  return {
    async get(path) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
      if (!res.ok) throw new Error(`Supabase GET ${path} failed: ${res.status}`);
      return res.json();
    },
    async del(table, token) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?token=eq.${encodeURIComponent(token)}`,
        { method: "DELETE", headers }
      );
      if (!res.ok) throw new Error(`Supabase DELETE ${table} failed: ${res.status}`);
    },
  };
}

async function cmdSend() {
  const topic = flag("topic") || "breaking";
  const title = flag("title") || "Dutimz update";
  const body = flag("body") || "";
  const link = flag("link") || "/";
  if (!ALLOWED_TOPICS.includes(topic)) throw new Error(`Unknown topic: ${topic}`);

  const sb = supabase();
  const [prefRows, subRows] = await Promise.all([
    sb.get(`push_topic_prefs?select=token&topic=eq.${encodeURIComponent(topic)}`),
    sb.get("push_subscriptions?select=token"),
  ]);
  const picked = new Set(prefRows.map((r) => r.token).filter(Boolean));
  const withAnyPref = new Set(
    (await sb.get("push_topic_prefs?select=token")).map((r) => r.token).filter(Boolean)
  );
  // Legacy devices never picked topics: they get everything.
  const audience = subRows
    .map((r) => r.token)
    .filter(Boolean)
    .filter((t) => picked.has(t) || !withAnyPref.has(t));
  const tokens = [...new Set(audience)];
  if (!tokens.length) return console.log(`No devices want "${topic}" yet.`);

  const sdk = await admin();
  const message = {
    notification: { title, body },
    webpush: { fcmOptions: { link }, notification: { icon: "/favicon.svg" } },
    data: { link },
    tokens,
  };
  let sent = 0;
  const dead = [];
  // sendEachForMulticast caps at 500 tokens per call.
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = await sdk.messaging().sendEachForMulticast({
      ...message,
      tokens: tokens.slice(i, i + 500),
    });
    sent += batch.successCount;
    batch.responses.forEach((r, j) => {
      const code = r.error?.code ?? "";
      if (
        !r.success &&
        (code.includes("registration-token-not-registered") ||
          code.includes("invalid-argument"))
      ) {
        dead.push(tokens[i + j]);
      }
    });
  }
  console.log(`Sent to ${sent}/${tokens.length} devices for "${topic}"`);
  // Prune dead tokens (uninstalled apps, anon unsubscribes) so the tables
  // stay clean without any manual cleanup.
  for (const t of dead) {
    await sb.del("push_subscriptions", t).catch(() => undefined);
    await sb.del("push_topic_prefs", t).catch(() => undefined);
  }
  if (dead.length) console.log(`Pruned ${dead.length} dead tokens`);
}

if (command === "send") await cmdSend();
else {
  console.error("Usage: send-push.mjs send --topic T --title T --body B --link L");
  process.exit(1);
}
