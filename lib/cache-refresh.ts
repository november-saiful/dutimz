import { getCloudflareContext } from "@opennextjs/cloudflare";

import { reportError } from "./errors";

/*
  Rewriting a cached page, deliberately, from a request that is not a reader's.

  The reader-facing surfaces are cached, and a cache HIT already costs 8-13 ms of CPU against a
  Workers Free ceiling of 10 ms — a render costs 20-700 ms. So a render can never happen inside a
  reader's invocation: it is killed with `error code: 1102` ("Worker exceeded resource limits")
  and the reader gets a 503 instead of a page. That is what `queue: discardQueue` in
  open-next.config.ts guarantees, and this module is the other half of it: the only code that
  asks the Worker to render a page, called from the desk and from a cron trigger, never from a
  request a reader made.

  The request is the one the adapter's own queue used to make — a HEAD against the service
  binding with the build's preview mode id — because that is the only header that makes Next
  render a page rather than answer from its cache. `__NEXT_PREVIEW_MODE_ID` is inlined into the
  Durable Object bundle at build time; the server bundle sets the un-prefixed name at startup
  from the prerender manifest, which is what a route handler sees.

  Everything here is bounded on purpose. Regenerating a page is the expensive thing this file
  exists to do, so a caller cannot ask for an unbounded number of them: the list is deduplicated,
  run with a small concurrency, and abandoned once the wall-clock budget is spent. A page that
  misses the budget is simply refreshed on the next schedule; nothing is remembered, so a failure
  can never freeze a route the way the Durable Object queue did.
*/
const REVALIDATION_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT = 2;
const BUDGET_MS = 25_000;

export type RefreshedPage = {
  path: string;
  status: number | null;
  /** `x-nextjs-cache` on the response; `REVALIDATED` is the only success. */
  cache: string | null;
  ok: boolean;
};

type ServiceBinding = {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
};

function selfReference(): ServiceBinding | undefined {
  try {
    const { env } = getCloudflareContext();
    return env.WORKER_SELF_REFERENCE as ServiceBinding | undefined;
  } catch (error) {
    // Outside the Worker there is no binding to reach the site back through (a plain `next dev`
    // with no wrangler context, for instance). Refreshing is a deployment-time concern, so this
    // is reported and skipped rather than thrown at the caller.
    reportError("cache refresh context", error);
    return undefined;
  }
}

/**
 * Re-render each path and report what came back.
 *
 * The origin is fixed to the production hostname: the HEAD never leaves the Worker (it is a
 * service-binding call), and the host is only used to build an absolute URL.
 */
export async function refreshCachedPages(paths: string[]): Promise<RefreshedPage[]> {
  const service = selfReference();
  if (!service) {
    reportError(
      "cache refresh",
      new Error("WORKER_SELF_REFERENCE is not bound: no page can be regenerated"),
    );
    return [];
  }

  const previewModeId =
    process.env.NEXT_PREVIEW_MODE_ID ?? process.env.__NEXT_PREVIEW_MODE_ID ?? "";
  if (!previewModeId) {
    reportError(
      "cache refresh",
      new Error("the build's preview mode id is missing: Next would serve the cache, not render"),
    );
    return [];
  }

  const queue = [...new Set(paths)];
  const host = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://dutimz.com").host;
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const deadline = Date.now() + BUDGET_MS;
  const results: RefreshedPage[] = [];

  const drain = async () => {
    for (;;) {
      if (Date.now() > deadline) return;
      const path = queue.shift();
      if (path === undefined) return;
      results.push(await refreshOne(service, `${protocol}://${host}${path}`, previewModeId));
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, () => drain()),
  );
  return results;
}

async function refreshOne(
  service: ServiceBinding,
  url: string,
  previewModeId: string,
): Promise<RefreshedPage> {
  let response: Response | undefined;
  try {
    response = await service.fetch(url, {
      method: "HEAD",
      headers: { "x-prerender-revalidate": previewModeId, "x-isr": "1" },
      signal: AbortSignal.timeout(REVALIDATION_TIMEOUT_MS),
    });
    const cache = response.headers.get("x-nextjs-cache");
    // A 200 is not success on its own: a page that answers 200 with `HIT` or `STALE` came from
    // the cache and was not rewritten, which is exactly the failure this module exists to see.
    const ok = response.status === 200 && cache === "REVALIDATED";
    if (!ok) {
      console.error(
        `[cache] refresh did not land for ${url}: status ${response.status}, x-nextjs-cache ${cache ?? "absent"}`,
      );
    }
    return { path: new URL(url).pathname, status: response.status, cache, ok };
  } catch (error) {
    reportError(`cache refresh ${url}`, error);
    return { path: new URL(url).pathname, status: null, cache: null, ok: false };
  } finally {
    try {
      await response?.body?.cancel();
    } catch {
      // The body was already consumed or never opened; nothing to release.
    }
  }
}
