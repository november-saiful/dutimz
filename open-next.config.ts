// Required by the Cloudflare adapter: without this file `opennextjs-cloudflare build`
// refuses to run, and `opennextjs-cloudflare deploy` then fails with "Could not find
// compiled Open Next config, did you run the build command?".
//
// The adapter's defaults for `incrementalCache`, `queue` and `tagCache` are all `"dummy"`
// (see resolveIncrementalCache/resolveQueue in @opennextjs/cloudflare). A dummy incremental
// cache stores nothing, so every route that exports `revalidate` was re-rendered on every
// request — the live site answered `x-nextjs-cache: MISS` on every load and the article route
// shipped `Cache-Control: no-store` — and a dummy queue means the adapter cannot enqueue the
// regeneration a stale entry needs. Both are wired up here.
//
// The cache keyspace is namespaced by the Next build id, so entries from one release can never
// be served by another, and a preview build can never be served as production.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doShardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";

/*
  A queue that regenerates nothing, on purpose.

  `queue.send()` is awaited inline by the cache interceptor, inside the invocation of whoever
  asked for the page. Anything this queue does is therefore paid for by that caller, and a reader
  asking for a stale page is the common case. That is how this site answered 503 `error code:
  1102` ("Worker exceeded resource limits") to its front page and to every article: a cache HIT
  measured 8-13 ms of CPU and a render 20-700 ms, against a Workers Free ceiling of 10 ms.
  Handing the work to `ctx.waitUntil` did not move it off the request — the isolate stays alive
  and billed until the promise settles, and the reader's invocation is killed all the same.

  This queue was a Durable Object before that, and it failed differently: the object is billed
  for every second it is awake at 128 MB (the free allowance is 13,000 GB-s a day, and the
  account was blocked with `101,562,500,000` µs of it used), and it persisted a single failed
  revalidation under an id that does not change for an unchanged entry, freezing that route at
  `x-nextjs-cache: STALE` until the next deploy.

  So nothing a reader does triggers a render any more. A stale entry is served from R2, and
  freshness is delivered explicitly by `lib/cache-refresh.ts` from the two places that are not a
  reader's request: the desk, right after it changes something (`app/api/revalidate`), and a
  cron trigger on the media Worker every five minutes (`worker/src/index.ts`).

  What that gives up: a page's `revalidate` window no longer rewrites the page by itself — it is
  only the moment the entry becomes stale. The schedule and the desk are what rewrite it. That is
  deliberate: it turns an unbounded, reader-driven render rate into a fixed one, which is the
  only shape that survives a CPU ceiling this low.
*/
const discardQueue = {
  name: "discard-queue",
  send: async (): Promise<void> => {},
};

export default defineCloudflareConfig({
  // Rendered pages and the data cache live in the `dutimz-cache` bucket (bound as
  // NEXT_INC_CACHE_R2_BUCKET). This bucket only ever holds rendered output — never media —
  // so the media buckets stay reachable only by the media Worker.
  //
  // No regional cache wrapper: its lookup is served from the local Cache API, and its real
  // benefit (bypassing the tag cache on a hit) is worth nothing while every tag a page carries
  // is a soft tag that the tag cache already answers for.
  incrementalCache: r2IncrementalCache,
  // Time-based revalidation still needs a queue object — without one the adapter logs "Dummy
  // queue is not implemented" — but its job here is to be discarded: see the note above.
  queue: discardQueue,
  // The desk edits what readers see, and the pages it changes are cached, so the invalidation
  // that `revalidatePath` records has somewhere to live: without a real tag cache the call is
  // accepted and silently does nothing (the adapter's default tag cache is a no-op), and an
  // approved story then waits for the page's own revalidate window. Sharded rather than
  // single-DO because every page render reads it, and one Durable Object for the whole site
  // is a queue of writes in front of every hit.
  //
  // One base shard, though, not the default four. Sharding buys concurrent writes, and the only
  // writer here is the desk pressing approve; what it costs is objects, and objects are billed
  // for the time they are awake. Eight shards (four base, soft and hard) that are cold most of
  // the day pay a cold start on nearly every render; two that stay warm do not.
  tagCache: doShardedTagCache({ baseShardSize: 1 }),
});
