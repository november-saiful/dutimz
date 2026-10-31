// The caching that serves every public page is configured in three places that can each fail
// independently, and a failure in any of them is invisible: the site keeps answering 200 while
// quietly re-rendering every page from the database.
//
// That is not hypothetical. The Cloudflare adapter resolves `incrementalCache`, `queue` and
// `tagCache` to no-op implementations when they are not overridden, so a bare
// `defineCloudflareConfig()` is a valid, buildable, wholly uncached deployment — production ran
// that way, answering `x-nextjs-cache: MISS` on every request and serving the article route with
// `Cache-Control: no-store`. These assertions make that a failing test rather than a discovery.
//
// The bindings themselves are non-inheritable in Wrangler, so the preview environment has to
// re-declare each one; a preview that forgot them would deploy a Worker whose cache silently
// does nothing, which is the same bug wearing a different hat.
//
// The queue is the one piece that is deliberately *not* a binding any more, and deliberately not
// a worker either. It was a Durable Object per route, and that is what blew the Workers Free
// quota (13,000 GB-s a day — 28.2 hours of one object — reported as `101,562,500,000`
// microseconds) and what froze routes at `x-nextjs-cache: STALE` until the next deploy. It was
// then a local `ctx.waitUntil` queue, and that moved the render into the reader's own invocation
// — the reader was answered 503 `error code: 1102` instead. It now does nothing at all, and every
// render is asked for explicitly by `lib/cache-refresh.ts` from the desk or from a cron trigger.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { cacheBuckets, parseJsonc } from '../scripts/ensure-cache-buckets.mjs';

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const wranglerConfig = async () =>
  parseJsonc(await readProjectFile('wrangler.jsonc'));

// These names are the adapter's contract, not this project's preference: R2IncrementalCache
// reads `NEXT_INC_CACHE_R2_BUCKET` and the sharded tag cache reads `NEXT_TAG_CACHE_DO_SHARDED`,
// and that class has to be exported from the generated Worker under the name the config declares.
const R2_BINDING = 'NEXT_INC_CACHE_R2_BUCKET';
const TAG_CACHE_BINDING = 'NEXT_TAG_CACHE_DO_SHARDED';
const TAG_CACHE_CLASS = 'DOShardedTagCache';

/** The retired queue. It must not come back: see the note at the top of this file. */
const RETIRED_QUEUE_BINDING = 'NEXT_CACHE_DO_QUEUE';
const RETIRED_QUEUE_CLASS = 'DOQueueHandler';

/** The routes a reader reaches through an approval, and the window each one falls back to. */
const CACHED_READING_ROUTES = [
  'app/page.tsx',
  'app/news/[slug]/page.tsx',
  'app/category/[slug]/page.tsx',
  'app/sitemap.ts',
];

test('the adapter is configured with a real cache and queue, not its no-op defaults', async () => {
  const config = await readProjectFile('open-next.config.ts');

  assert.match(
    config,
    /from "@opennextjs\/cloudflare\/overrides\/incremental-cache\/r2-incremental-cache"/,
    'the R2 incremental cache must be imported; without an override the adapter stores nothing',
  );
  assert.match(
    config,
    /from "@opennextjs\/cloudflare\/overrides\/tag-cache\/do-sharded-tag-cache"/,
    'the tag cache must be imported; without one `revalidatePath` is accepted and does nothing',
  );

  // The queue exists only so the adapter does not fall back to `"dummy"`, and doing nothing is
  // the whole point: `send()` runs inside the invocation of whoever asked for the stale page, so
  // any work here is billed to a reader. A render measured 20-700 ms against a 10 ms ceiling;
  // that is the 503 (error 1102) this site served instead of pages.
  assert.match(config, /queue:\s*discardQueue/);
  assert.doesNotMatch(
    config,
    /ctx\.waitUntil\(/,
    'a reader request must never schedule a render, not even in the background',
  );
  assert.doesNotMatch(
    config,
    /WORKER_SELF_REFERENCE/,
    'the queue must not reach the Worker back: that is a render inside the reader invocation',
  );

  // The Durable Object queue is what exhausted the daily duration allowance and what froze
  // routes at STALE until the next deploy. It must not be wired back in.
  assert.doesNotMatch(
    config,
    /overrides\/queue\/do-queue/,
    'the Durable Object revalidation queue must stay out: see the note at the top of this file',
  );

  assert.match(config, /incrementalCache:\s*r2IncrementalCache/);
  assert.match(config, /tagCache:\s*doShardedTagCache/);

  // One base shard, not the default four: every object is billed for the time it is awake, the
  // only writer is the desk pressing approve, and eight cold shards pay a cold start per render.
  assert.match(
    config,
    /doShardedTagCache\(\s*\{\s*baseShardSize:\s*1\s*\}\s*\)/,
    'the tag cache must not keep the default shard count: objects cost duration while awake',
  );

  // A bare call is exactly how the site shipped uncached, so it must not come back.
  assert.doesNotMatch(
    config,
    /defineCloudflareConfig\(\s*\)/,
    'defineCloudflareConfig() with no arguments means no cache and no queue',
  );
});

test('production binds the cache bucket and the tag cache, and no revalidation queue', async () => {
  const config = await wranglerConfig();

  const productionBuckets = cacheBuckets(config, 'production');
  assert.equal(
    productionBuckets.length,
    1,
    'production binds one bucket: the cache bucket. Media stays bound to the media Worker.',
  );
  assert.equal(config.r2_buckets?.[0]?.binding, R2_BINDING);
  assert.ok(productionBuckets[0], 'the cache bucket must be named');

  const bindings = config.durable_objects?.bindings ?? [];

  // A binding here would mean the Durable Object queue was back — the thing that spent the whole
  // daily duration allowance and froze routes at STALE. Revalidation is local now.
  assert.ok(
    !bindings.some((entry) => entry.name === RETIRED_QUEUE_BINDING),
    `${RETIRED_QUEUE_BINDING} must not be bound: revalidation runs in ctx.waitUntil`,
  );

  // The tag cache is the only thing that makes the desk's invalidation mean anything, and a
  // missing binding degrades silently: `revalidatePath` still returns, the pages simply wait out
  // their revalidate window. So it is asserted here rather than trusted.
  assert.ok(
    bindings.some(
      (entry) => entry.name === TAG_CACHE_BINDING && entry.class_name === TAG_CACHE_CLASS,
    ),
    `the tag cache must be bound as ${TAG_CACHE_BINDING} -> ${TAG_CACHE_CLASS}`,
  );
  assert.ok(
    (config.migrations ?? []).some((entry) =>
      entry.new_sqlite_classes?.includes(TAG_CACHE_CLASS),
    ),
    'the tag cache class needs its own migration tag: migrations are append-only',
  );

  // `v1` created the queue class and has already been applied, and the class is still exported by
  // the generated Worker. A tag that has been applied cannot be withdrawn, so it stays even
  // though nothing binds the class any more.
  assert.ok(
    (config.migrations ?? []).some((entry) =>
      entry.new_sqlite_classes?.includes(RETIRED_QUEUE_CLASS),
    ),
    'the v1 migration must stay even though the queue class is no longer bound',
  );
  assert.equal(
    config.observability?.enabled,
    true,
    'the Worker logs that reportError writes to are only queryable with observability enabled',
  );
});

test('the refresher can reach the Worker back through its own service binding', async () => {
  const config = await wranglerConfig();
  const selfReference = (config.services ?? []).find(
    (entry) => entry.binding === 'WORKER_SELF_REFERENCE',
  );
  assert.ok(
    selfReference,
    'lib/cache-refresh.ts renders a page by calling the Worker back over WORKER_SELF_REFERENCE; ' +
      'without the binding there is no way to rewrite a cached page at all',
  );
  assert.equal(selfReference.service, config.name);
});

test('every render is asked for explicitly, through a door that is not a reader request', async () => {
  // Half of the guarantee is open-next.config.ts (nothing renders on a reader's request); this is
  // the other half: the renders that do happen are named, bounded, and reachable only from the
  // desk or from the schedule.
  const refresher = await readProjectFile('lib/cache-refresh.ts');
  assert.match(
    refresher,
    /"x-prerender-revalidate"/,
    'a HEAD without the build\'s preview mode id is answered from the cache, not rendered',
  );
  assert.match(refresher, /"x-isr": "1"/, 'the request has to be marked as a cache refresh');
  assert.match(
    refresher,
    /REVALIDATED/,
    'a 200 alone is not success: only REVALIDATED means the entry was rewritten',
  );
  assert.match(
    refresher,
    /WORKER_SELF_REFERENCE/,
    'the render must go through the service binding, not out to the public edge and back',
  );

  // The scheduled door: called by a cron job with no session, so it carries its own token, and
  // refuses rather than falling open when the token is not configured.
  const cron = await readProjectFile('app/api/cache/refresh/route.ts');
  assert.match(cron, /CACHE_REFRESH_TOKEN/, 'the scheduled refresh must be authenticated');
  assert.match(cron, /status: 401|401/, 'a wrong or missing token must be refused');
  assert.match(
    cron,
    /sweepPagesToRefresh/,
    'the schedule must sweep the archive too: an article the desk never edits would otherwise be ' +
      'rendered once and never rewritten again',
  );
  assert.doesNotMatch(
    cron,
    /revalidateReadingSurfaces/,
    'the schedule rewrites pages; invalidating every tag is the desk\'s job and would only ' +
      'mark the archive stale',
  );

  // The desk: it still invalidates, and it now also asks for the render, because nothing else
  // will until the next tick of the schedule.
  const desk = await readProjectFile('app/api/revalidate/route.ts');
  assert.match(desk, /revalidateReadingSurfaces\(\)/);
  assert.match(desk, /refreshCachedPages/, 'an approval has to rewrite the pages it changed');
  assert.match(
    desk,
    /ctx\.waitUntil\(/,
    'the desk must not wait for the renders; it already has its answer',
  );

  // And the schedule itself, on the one Worker in this project that can export `scheduled`.
  const workerSource = await readProjectFile('worker/src/index.ts');
  assert.match(workerSource, /async scheduled\(/, 'the media Worker runs the refresh on a trigger');
  const workerConfig = parseJsonc(await readProjectFile('worker/wrangler.jsonc'));
  const crons = workerConfig.triggers?.crons ?? [];
  assert.ok(
    crons.length > 0,
    'the trigger has to be declared here, not clicked into the dashboard, so a release re-asserts it',
  );
  assert.ok(
    workerConfig.vars?.CACHE_REFRESH_URL,
    'the cron needs the portal address it refreshes',
  );
  assert.doesNotMatch(
    JSON.stringify(workerConfig.vars),
    /CACHE_REFRESH_TOKEN/,
    'the refresh token is a secret: it must never be committed as a var',
  );
});

test('the preview environment re-declares every binding it needs, in its own namespace', async () => {
  const config = await wranglerConfig();
  const preview = config.env?.preview ?? {};

  // Bindings are non-inheritable in Wrangler: anything missing here is simply absent in the
  // preview Worker, and the cache degrades to doing nothing rather than failing loudly.
  assert.equal(preview.r2_buckets?.[0]?.binding, R2_BINDING);
  // The preview needs no queue binding either: revalidation is local to whichever Worker serves
  // the request, so there is nothing to declare and nothing to inherit.
  assert.ok(
    !(preview.durable_objects?.bindings ?? []).some(
      (entry) => entry.name === RETIRED_QUEUE_BINDING,
    ),
    'the preview must not bind the retired queue either',
  );
  assert.ok(
    (preview.durable_objects?.bindings ?? []).some(
      (entry) => entry.name === TAG_CACHE_BINDING && entry.class_name === TAG_CACHE_CLASS,
    ),
    'the preview invalidates its own pages, so it needs its own tag cache',
  );
  assert.ok(
    (preview.migrations ?? []).some((entry) =>
      entry.new_sqlite_classes?.includes(RETIRED_QUEUE_CLASS),
    ),
    'an environment deploys its own Worker, so it keeps the migration history that class needs',
  );
  assert.ok(
    (preview.migrations ?? []).some((entry) =>
      entry.new_sqlite_classes?.includes(TAG_CACHE_CLASS),
    ),
    'an environment deploys its own Worker, so it needs its own migration for the tag cache',
  );

  // A preview build renders demo content. It writes to its own bucket so preview churn can
  // never grow — or be served from — the namespace a real reader reads.
  const productionBucket = cacheBuckets(config, 'production')[0];
  const previewBucket = cacheBuckets(config, 'preview')[0];
  assert.ok(previewBucket, 'the preview must bind a cache bucket of its own');
  assert.notEqual(
    previewBucket,
    productionBucket,
    'a preview must not share the production cache bucket',
  );
});

test('the preview names its own script in the self reference', async () => {
  const config = await wranglerConfig();
  const previewSelf = (config.env?.preview?.services ?? []).find(
    (entry) => entry.binding === 'WORKER_SELF_REFERENCE',
  );
  assert.ok(previewSelf, 'the preview Worker needs the self reference too');
  // `deploy --env preview` publishes `<name>-<env>`, so pointing this at the production
  // script would have the preview queue revalidating the live site.
  assert.equal(
    previewSelf.service,
    `${config.name}-preview`,
    'the preview self reference must target the preview Worker, not production',
  );
});

test('the pages an approval changes are cached rather than rendered per request', async () => {
  // These four routes used to render per request so an approval appeared at once. That is what put
  // them over the Worker's resource limit — Cloudflare answered 503, error 1102 ("Worker exceeded
  // resource limits") to the front page and to article pages, for every reader, all day. They are
  // cached now and invalidated by the desk (see the next test), so the price of an approval is one
  // regeneration rather than a render on every request.
  for (const path of CACHED_READING_ROUTES) {
    const source = await readProjectFile(path);
    assert.doesNotMatch(
      source,
      /export const dynamic\s*=\s*"force-dynamic"/,
      `${path} must not render per request: that is the load the cache exists to remove`,
    );
    assert.match(
      source,
      /export const revalidate\s*=\s*\d+/,
      `${path} must declare the window it falls back to when an invalidation never arrives`,
    );
    // Cached output is shared by every visitor, so nothing may vary by visitor. A render that read
    // a cookie or a header would be served, from the cache, to somebody else.
    assert.doesNotMatch(
      source,
      /next\/headers/,
      `${path} serves the same HTML to every visitor and must not read cookies or headers`,
    );
  }

  // A dynamic segment with no params to prerender is rendered per request and never stored,
  // whatever `revalidate` says — verified against a local Worker: the route answered
  // `Cache-Control: private, no-cache, no-store` and wrote nothing to the incremental cache. So
  // the two routes under a dynamic segment have to name their params.
  for (const path of ['app/news/[slug]/page.tsx', 'app/category/[slug]/page.tsx']) {
    const source = await readProjectFile(path);
    assert.match(
      source,
      /export (async )?function generateStaticParams\(\)/,
      `${path} needs generateStaticParams: without it there is no cache entry to invalidate`,
    );
  }
});

test('the fallback windows are wide enough that the desk, not the clock, keeps pages current', async () => {
  // The window is the backstop for an invalidation that never arrives, not the mechanism: the
  // desk invalidates on every approval. A minute-wide window therefore bought nothing and
  // regenerated the front page, every article and the sitemap in the background continuously —
  // which is the load that spent the whole daily Durable Object allowance.
  for (const path of CACHED_READING_ROUTES) {
    const source = await readProjectFile(path);
    const match = source.match(/export const revalidate = ([\d_]+)/);
    assert.ok(match, `${path} must declare the window it falls back to`);
    const seconds = Number(match[1].replace(/_/g, ''));
    assert.ok(
      seconds >= 300,
      `${path} falls back after ${seconds}s; a one-minute window regenerates it in the background for nobody`,
    );
  }

  // The article window and the schedule's archive sweep are the same number of seconds on purpose:
  // the sweep is what rewrites a story the desk did not touch, so an entry must not expire before
  // the sweep that reaches it comes round.
  const article = await readProjectFile('app/news/[slug]/page.tsx');
  const articleWindow = Number(
    article.match(/export const revalidate = ([\d_]+)/)?.[1]?.replace(/_/g, ''),
  );
  const sweepSource = await readProjectFile('lib/revalidate.ts');
  const sweepWindow = Number(
    sweepSource.match(/SWEEP_WINDOW_SECONDS = ([\d_]+)/)?.[1]?.replace(/_/g, ''),
  );
  assert.ok(articleWindow > 0, 'the article window must be declared');
  assert.ok(sweepWindow > 0, 'the sweep window must be declared');
  assert.ok(
    articleWindow >= sweepWindow,
    `an article falls back after ${articleWindow}s; the sweep must reach it within ${sweepWindow}s`,
  );
});

test('a route whose URL space is unbounded is not cached at all', async () => {
  // Any string answers 200 on /u/[username] — the shell holds no member data, PublicProfile
  // fetches it client-side — so a crawler or a scanner walking /u/... minted a cache entry per
  // invented name, and every one of them went stale and asked to be regenerated. There is
  // nothing in that shell that can go out of date, so it does not belong in the cache.
  const profile = await readProjectFile('app/u/[username]/page.tsx');
  assert.match(
    profile,
    /export const dynamic = "force-dynamic"/,
    'the profile shell must render per request: its URL space cannot be bounded',
  );
  assert.doesNotMatch(
    profile,
    /export const revalidate/,
    'a route that renders per request has no window to fall back to',
  );
});

test('the desk invalidates what it changes, through one authenticated door', async () => {
  // The other half of caching a page an approval changes: something has to say it changed. The
  // surfaces are named once, on the server, and the invalidation is gated the way every other desk
  // surface is — by the database's own rule, not a second copy of the role list here.
  const surfaces = await readProjectFile('lib/revalidate.ts');
  for (const path of ['/', '/news/[slug]', '/category/[slug]', '/sitemap.xml']) {
    assert.ok(
      surfaces.includes(`"${path}"`),
      `lib/revalidate.ts must invalidate ${path}: an approval changes it`,
    );
  }
  assert.match(surfaces, /revalidatePath\(/, 'the surfaces have to actually be invalidated');

  // The pages the desk rewrites follow the last edit, not the last publication: a story can be
  // edited from any point in the archive, and that story is the one whose page is now wrong. A
  // publication-ordered list would always name the newest stories and let the edited old one be
  // rendered for whichever reader arrived next.
  assert.match(
    surfaces,
    /getRecentlyUpdatedArticles/,
    'the desk must refresh the most recently edited stories, not the newest published ones',
  );
  const stories = await readProjectFile('lib/stories.ts');
  const recent = stories.slice(stories.indexOf('export async function getRecentlyUpdatedArticles'));
  assert.notEqual(recent.length, 0, 'lib/stories.ts must export getRecentlyUpdatedArticles');
  assert.match(
    recent.slice(0, recent.indexOf('\n}')),
    /\.order\("updated_at"\s*,\s*\{\s*ascending:\s*false\s*\}\)/,
    'the refresh list must be ordered by updated_at: publication order misses edits to old stories',
  );

  const route = await readProjectFile('app/api/revalidate/route.ts');
  assert.match(route, /revalidateReadingSurfaces\(\)/, 'the route performs the invalidation');
  assert.match(
    route,
    /auth\.getUser\(token\)/,
    'the caller must be proven to be a signed-in account',
  );
  assert.match(
    route,
    /rpc\("is_moderator_or_admin"\)/,
    'the role must come from the database rule every other desk surface uses',
  );
  assert.doesNotMatch(
    route,
    /searchParams|request\.json|await request\.text/,
    'the caller says "I changed something"; it does not get to choose what is invalidated',
  );

  // Every desk action that changes what a reader can see has to say so. Each of these is a
  // mutation of published writing: approving or rejecting a story or a comment, approving an edit
  // to live writing, publishing, unpublishing, rewriting a story's body, and granting a withdrawal.
  for (const [path, rpc] of [
    ['components/account/moderation-queue.tsx', 'moderate_article'],
    ['components/account/moderation-queue.tsx', 'moderate_comment'],
    ['components/account/pending-edits.tsx', 'moderate_article_edit'],
    ['components/account/pending-edits.tsx', 'moderate_spotlight_edit'],
    ['components/account/admin-articles.tsx', 'admin_update_article'],
    ['components/account/admin-articles.tsx', 'admin_set_article_publication'],
    ['components/account/admin-articles.tsx', 'admin_set_article_status'],
    ['components/account/admin-articles.tsx', 'admin_delete_article'],
    ['components/account/admin-dashboard.tsx', 'review_withdrawal'],
  ]) {
    const source = await readProjectFile(path);
    assert.ok(source.includes(`"${rpc}"`), `${path} is expected to call ${rpc}`);
    assert.match(
      source,
      /revalidateReaders\(\)/,
      `${path} changes published content through ${rpc} and must invalidate the reading surfaces`,
    );
  }
});

test('the release creates the cache buckets before it deploys the Workers that bind them', async () => {
  const workflow = await readProjectFile('.github/workflows/ci.yml');

  assert.match(
    workflow,
    /run: node scripts\/ensure-cache-buckets\.mjs\r?\n/,
    'the release must ensure the production cache buckets exist',
  );
  assert.match(
    workflow,
    /run: node scripts\/ensure-cache-buckets\.mjs --env preview/,
    'the preview job must ensure its own buckets exist',
  );

  const at = workflow.indexOf('\n  release:');
  assert.notEqual(at, -1, 'the workflow must define a release job');
  const release = workflow.slice(at);
  const ensure = release.indexOf('Ensure the cache buckets exist');
  const portal = release.indexOf('Deploy the production Worker');
  assert.notEqual(ensure, -1, 'the release must ensure the cache buckets exist');
  assert.ok(
    ensure < portal,
    '`wrangler deploy` binds a bucket by name rather than creating one, so the bucket has to exist first',
  );
  assert.ok(
    release.includes('cache buckets ensured'),
    'a half-finished release must report whether the buckets were ensured',
  );
});

test('the live check proves the cache is serving, not merely that pages answer 200', async () => {
  const script = await readProjectFile('scripts/verify-live-config.mjs');
  assert.match(script, /x-nextjs-cache/, 'the live check must read the cache state');
  assert.match(
    script,
    /state === 'HIT'/,
    'the live check must accept a real cache hit',
  );
  assert.match(
    script,
    /\{ path: '\/about\/', allowStale: false, required: true \}/,
    'a fully static page must be required to hit outright: it can never be legitimately stale, ' +
      'so a miss there cannot be excused as a page that is merely due for regeneration',
  );
  // The front page is the one whose per-request render produced the 503s, and it is prerendered
  // and uploaded with the deployment, so it has to come from the cache too. STALE is allowed:
  // it is still served from the cache, with the regeneration happening behind the response.
  assert.match(
    script,
    /\{ path: '\/', allowStale: true, required: true \}/,
    'the front page must be gated on the cache as well, or a release could ship it back to ' +
      'rendering on every request (Cloudflare 1102) with nothing to say so',
  );

  const probe = script.slice(
    script.indexOf('async function visit('),
    script.indexOf('async function fetchText('),
  );
  assert.notEqual(probe.length, 0, 'the cache probe needs its own request helper');
  assert.doesNotMatch(
    probe,
    /headers:/,
    'the probe must send no request headers: a cache-control header of its own could defeat the ' +
      'caching it exists to prove, which is why it does not reuse the redirect-walking helper',
  );
});
