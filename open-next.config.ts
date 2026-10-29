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
import { defineCloudflareConfig, getCloudflareContext } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doShardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";

/*
  Regenerating a stale page, without a Durable Object.

  This used to be the adapter's `doQueue`, which is one `DOQueueHandler` Durable Object per
  route. It works, and it is why the queue here was a Durable Object at all: `queue.send()` is
  awaited inline in the cache interceptor, before the reader's response is returned, and an RPC
  that returns as soon as the object has parked the work is what kept a stale page from costing
  the reader the whole regeneration. Two things about it did not survive contact with a real
  site on the Workers Free plan.

  The first is duration. A Durable Object is billed for every second it is alive at 128 MB,
  whether it is doing anything or not, and the free allowance is 13,000 GB-s a day — 28.2 hours
  of one object. The queue object is alive for the whole of `executeRevalidation`, which is a
  full HEAD render of the page, and the object is torn down again after ~10s idle, so it is a
  cold start plus a render for every stale page view. At a 60-second window on nine routes that
  is not a burst, it is a baseline, and it exhausted the daily allowance outright: the account
  was blocked with `101,562,500,000` duration used — that number is microseconds of a 128 MB
  object, i.e. exactly the 28.2 hours, and every Durable Object request failed until the reset.

  The second is worse, because it is silent. `DOQueueHandler.revalidate()` returns early for any
  message whose `MessageDeduplicationId` is in `routeInFailedState`, and that map is persisted to
  the object's SQLite and restored on every cold start. The id is a hash of the path, the entry's
  `lastModified` and its etag, so for an entry that is not changing it is a constant. One
  transient failure — a 500, a timeout, anything that is not an `OpenNextError` — after six
  retries leaves a row behind that is only cleared when the build id changes, and from then on
  that route never revalidates again for the life of the deployment. It keeps answering
  `x-nextjs-cache: STALE`, every request re-enqueues, the object wakes up and returns immediately,
  and the page is frozen until the next deploy while still paying duration for every reader.

  So the revalidation is handed to `ctx.waitUntil` in this Worker instead. It is the same HEAD
  request the Durable Object made, with the same headers, against the same service binding; the
  difference is that it costs nothing to be idle, there is no state that outlives the attempt, and
  a failure is simply retried by the next stale request rather than being remembered forever. The
  reader is not made to wait for it: `send` returns before the fetch resolves, which is what the
  Durable Object was buying, and Cloudflare keeps the isolate alive until the `waitUntil` promise
  settles (bounded here by the same 10s timeout the adapter used).

  What it gives up: the Durable Object deduplicated revalidations across isolates, so two readers
  landing on the same stale page in different isolates could share one regeneration. Here they
  cannot, and `inFlight` only deduplicates within an isolate. That is a few redundant renders of
  one page instead of a quota that cannot be paid, and the windows below are wide enough that a
  page is regenerated a handful of times an hour rather than continuously.
*/
const REVALIDATION_TIMEOUT_MS = 10_000;

/** One regeneration per route per isolate at a time; concurrent callers share the result. */
const inFlight = new Set<string>();

const waitUntilQueue = {
  name: "wait-until-queue",
  send: (msg: {
    MessageDeduplicationId: string;
    MessageBody: { host: string; url: string };
  }): Promise<void> => {
    const { env, ctx } = getCloudflareContext();
    const { host, url } = msg.MessageBody;

    if (inFlight.has(msg.MessageDeduplicationId)) {
      return Promise.resolve();
    }
    inFlight.add(msg.MessageDeduplicationId);

    ctx.waitUntil(
      (async () => {
        const protocol = host.includes("localhost") ? "http" : "https";
        // The service binding, not the public hostname: this call must not leave the Worker for
        // the edge and come back. `x-prerender-revalidate` has to be the build's own preview mode
        // id — the adapter sets `NEXT_PREVIEW_MODE_ID` from the prerender manifest at startup, and
        // the Durable Object got the same value inlined at build time under a double underscore.
        const service = env.WORKER_SELF_REFERENCE as
          | { fetch: (input: string, init?: RequestInit) => Promise<Response> }
          | undefined;
        if (!service) {
          console.error(
            `[cache] no WORKER_SELF_REFERENCE binding: cannot revalidate ${host}${url}`,
          );
          return;
        }

        let response: Response | undefined;
        try {
          response = await service.fetch(`${protocol}://${host}${url}`, {
            method: "HEAD",
            headers: {
              "x-prerender-revalidate":
                process.env.NEXT_PREVIEW_MODE_ID ??
                process.env.__NEXT_PREVIEW_MODE_ID ??
                "",
              "x-isr": "1",
            },
            signal: AbortSignal.timeout(REVALIDATION_TIMEOUT_MS),
          });
          const state = response.headers.get("x-nextjs-cache");
          // 200 alone is not success: a page that answers 200 with `STALE` or `HIT` was served
          // from the cache and not regenerated, which is the failure mode this file exists to
          // make visible. `REVALIDATED` is the only status that means the entry was rewritten.
          if (response.status !== 200 || state !== "REVALIDATED") {
            console.error(
              `[cache] revalidation did not land for ${host}${url}: ` +
                `status ${response.status}, x-nextjs-cache ${state ?? "absent"}`,
            );
          }
        } catch (error) {
          console.error(`[cache] revalidation failed for ${host}${url}`, error);
        } finally {
          inFlight.delete(msg.MessageDeduplicationId);
          try {
            await response?.body?.cancel();
          } catch {
            // The stream was already consumed; nothing to release.
          }
        }
      })(),
    );

    return Promise.resolve();
  },
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
  // Time-based revalidation (`export const revalidate = ...`) is exactly what needs a queue.
  // Without one the adapter logs "Dummy queue is not implemented" and never regenerates a
  // stale entry. The queue reaches the Worker back through WORKER_SELF_REFERENCE.
  queue: waitUntilQueue,
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
