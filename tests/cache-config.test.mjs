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
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { cacheBuckets, parseJsonc } from '../scripts/ensure-cache-buckets.mjs';

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const wranglerConfig = async () =>
  parseJsonc(await readProjectFile('wrangler.jsonc'));

// These names are the adapter's contract, not this project's preference: R2IncrementalCache
// reads `NEXT_INC_CACHE_R2_BUCKET`, do-queue reads `NEXT_CACHE_DO_QUEUE`, and the class has to
// be exported from the generated Worker under the name the config declares.
const R2_BINDING = 'NEXT_INC_CACHE_R2_BUCKET';
const QUEUE_BINDING = 'NEXT_CACHE_DO_QUEUE';
const QUEUE_CLASS = 'DOQueueHandler';

test('the adapter is configured with a real cache and queue, not its no-op defaults', async () => {
  const config = await readProjectFile('open-next.config.ts');

  assert.match(
    config,
    /from "@opennextjs\/cloudflare\/overrides\/incremental-cache\/r2-incremental-cache"/,
    'the R2 incremental cache must be imported; without an override the adapter stores nothing',
  );
  assert.match(
    config,
    /from "@opennextjs\/cloudflare\/overrides\/queue\/do-queue"/,
    'the queue must be imported; time-based revalidation cannot enqueue anything without it',
  );
  assert.match(config, /incrementalCache:\s*r2IncrementalCache/);
  assert.match(config, /queue:\s*doQueue/);

  // A bare call is exactly how the site shipped uncached, so it must not come back.
  assert.doesNotMatch(
    config,
    /defineCloudflareConfig\(\s*\)/,
    'defineCloudflareConfig() with no arguments means no cache and no queue',
  );
});

test('production binds the cache bucket, the queue class and its migration', async () => {
  const config = await wranglerConfig();

  const productionBuckets = cacheBuckets(config, 'production');
  assert.equal(
    productionBuckets.length,
    1,
    'production binds one bucket: the cache bucket. Media stays bound to the media Worker.',
  );
  assert.equal(config.r2_buckets?.[0]?.binding, R2_BINDING);
  assert.ok(productionBuckets[0], 'the cache bucket must be named');

  const queue = config.durable_objects?.bindings ?? [];
  assert.ok(
    queue.some((entry) => entry.name === QUEUE_BINDING && entry.class_name === QUEUE_CLASS),
    `the Durable Object queue must be bound as ${QUEUE_BINDING} -> ${QUEUE_CLASS}`,
  );
  assert.ok(
    (config.migrations ?? []).some((entry) => entry.new_sqlite_classes?.includes(QUEUE_CLASS)),
    'the queue class must be declared in a migration, or the deploy cannot create it',
  );
  assert.equal(
    config.observability?.enabled,
    true,
    'the Worker logs that reportError writes to are only queryable with observability enabled',
  );
});

test('the queue can reach the Worker back through its own service binding', async () => {
  const config = await wranglerConfig();
  const selfReference = (config.services ?? []).find(
    (entry) => entry.binding === 'WORKER_SELF_REFERENCE',
  );
  assert.ok(
    selfReference,
    'the Durable Object queue revalidates by calling the Worker back over WORKER_SELF_REFERENCE, ' +
      'and refuses to start without it',
  );
  assert.equal(selfReference.service, config.name);
});

test('the preview environment re-declares every binding it needs, in its own namespace', async () => {
  const config = await wranglerConfig();
  const preview = config.env?.preview ?? {};

  // Bindings are non-inheritable in Wrangler: anything missing here is simply absent in the
  // preview Worker, and the cache degrades to doing nothing rather than failing loudly.
  assert.equal(preview.r2_buckets?.[0]?.binding, R2_BINDING);
  assert.ok(
    (preview.durable_objects?.bindings ?? []).some(
      (entry) => entry.name === QUEUE_BINDING && entry.class_name === QUEUE_CLASS,
    ),
    'the preview must bind the queue as well; its own Worker needs the classes it declares',
  );
  assert.ok(
    (preview.migrations ?? []).some((entry) =>
      entry.new_sqlite_classes?.includes(QUEUE_CLASS),
    ),
    'an environment deploys its own Worker, so it needs its own migration for the class',
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

test('the routes served from the shared cache never read the request', async () => {
  // A shared cache is only safe while the server renders the same HTML for everyone. The
  // moment one of these routes reads a cookie or a header, one visitor's page can be handed
  // to another. Personalization in this app is client-side by design.
  for (const path of ['app/page.tsx', 'app/news/[slug]/page.tsx', 'app/category/[slug]/page.tsx']) {
    const source = await readProjectFile(path);
    assert.doesNotMatch(
      source,
      /next\/headers/,
      `${path} is cached for every visitor and must not read cookies or headers`,
    );
    assert.doesNotMatch(
      source,
      /\bunstable_noStore\b|\bnoStore\(/,
      `${path} must stay cacheable`,
    );
    assert.doesNotMatch(
      source,
      /export const dynamic\s*=\s*"force-dynamic"/,
      `${path} must stay cacheable`,
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
    /\{ path: '\/about\/', allowStale: false \}/,
    'a fully static page must be required to hit outright: it can never be legitimately stale, ' +
      'so a miss there cannot be excused as a page that is merely due for regeneration',
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
