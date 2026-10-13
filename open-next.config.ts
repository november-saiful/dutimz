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
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import doShardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";

export default defineCloudflareConfig({
  // Rendered pages and the data cache live in the `dutimz-cache` bucket (bound as
  // NEXT_INC_CACHE_R2_BUCKET). This bucket only ever holds rendered output — never media —
  // so the media buckets stay reachable only by the media Worker.
  //
  // No regional cache wrapper: its lookup is served from the local Cache API, and its real
  // benefit (bypassing the tag cache on a hit) is worth nothing while every tag a page carries
  // is a soft tag that the tag cache already answers for.
  incrementalCache: r2IncrementalCache,
  // Time-based revalidation (`export const revalidate = ...`) is exactly what needs a queue.
  // Without one the adapter logs "Dummy queue is not implemented" and never regenerates a
  // stale entry. The queue reaches the Worker back through WORKER_SELF_REFERENCE.
  queue: doQueue,
  // The desk edits what readers see, and the pages it changes are cached, so the invalidation
  // that `revalidatePath` records has somewhere to live: without a real tag cache the call is
  // accepted and silently does nothing (the adapter's default tag cache is a no-op), and an
  // approved story then waits for the page's own revalidate window. Sharded rather than
  // single-DO because every page render reads it, and one Durable Object for the whole site
  // is a queue of writes in front of every hit.
  tagCache: doShardedTagCache,
});
