import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['worker/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const worker = (await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)).default;
const env = {
  ALLOWED_ORIGINS: 'https://dutimz.com,https://www.dutimz.com',
  SUPABASE_URL: 'https://db.example.test',
  SUPABASE_ANON_KEY: 'anon-key',
};

function fetchAs(responder) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = responder;
  return () => { globalThis.fetch = originalFetch; };
}

for (const origin of ['https://dutimz.com', 'https://www.dutimz.com']) {
  test(`media preflight reflects the allowed ${origin} origin`, async () => {
    const response = await worker.fetch(new Request('https://media.dutimz.com/upload', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
    }), env);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.match(response.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  });

  test(`upload errors are readable JSON for ${origin}`, async () => {
    const unauthenticated = await worker.fetch(new Request('https://media.dutimz.com/upload', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'image/jpeg' },
      body: 'image-bytes',
    }), env);
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.headers.get('Access-Control-Allow-Origin'), origin);
    assert.match((await unauthenticated.json()).error, /আগে গুগল দিয়ে প্রবেশ করুন/);

    const restore = fetchAs(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/auth/v1/user')) return Response.json({ id: 'reader-id' });
      if (url.pathname.endsWith('/rest/v1/user_roles')) return Response.json([{ role: 'reader', reporter_tier: null }]);
      throw new Error(`Unexpected request ${url}`);
    });
    try {
      const forbidden = await worker.fetch(new Request('https://media.dutimz.com/upload', {
        method: 'POST',
        headers: { Origin: origin, Authorization: 'Bearer test-token', 'Content-Type': 'image/jpeg' },
        body: 'image-bytes',
      }), env);
      assert.equal(forbidden.status, 403);
      assert.equal(forbidden.headers.get('Access-Control-Allow-Origin'), origin);
      assert.match((await forbidden.json()).error, /সম্পাদকীয় অনুমতি প্রয়োজন/);
    } finally { restore(); }

    const restoreMime = fetchAs(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/auth/v1/user')) return Response.json({ id: 'reporter-id' });
      if (url.pathname.endsWith('/rest/v1/user_roles')) return Response.json([{ role: 'reporter', reporter_tier: 'general' }]);
      throw new Error(`Unexpected request ${url}`);
    });
    try {
      const unsupported = await worker.fetch(new Request('https://media.dutimz.com/upload', {
        method: 'POST',
        headers: { Origin: origin, Authorization: 'Bearer test-token', 'Content-Type': 'image/heic' },
        body: 'image-bytes',
      }), env);
      assert.equal(unsupported.status, 415);
      assert.equal(unsupported.headers.get('Access-Control-Allow-Origin'), origin);
      assert.match((await unsupported.json()).error, /HEIC/);
    } finally { restoreMime(); }
  });
}

test('unlisted origins cannot use upload or preflight', async () => {
  for (const method of ['OPTIONS', 'POST']) {
    const response = await worker.fetch(new Request('https://media.dutimz.com/upload', {
      method,
      headers: { Origin: 'https://attacker.example', 'Content-Type': 'image/jpeg' },
      ...(method === 'POST' ? { body: 'image-bytes' } : {}),
    }), env);
    assert.equal(response.status, 403);
    assert.notEqual(response.headers.get('Access-Control-Allow-Origin'), 'https://attacker.example');
  }
});

test('a plain reader uploads a face or a banner and it lands in the profile scope', async () => {
  // The one upload an ordinary member is meant to make. A reader has no newsroom role, so the
  // news scope above refuses them — and this scope must not, or nobody could set a picture.
  const puts = [];
  const written = [];
  const bucket = {
    put: async (key, body, options) => { puts.push({ key, options }); },
    head: async () => ({ size: 11 }),
    delete: async () => {},
  };
  const restore = fetchAs(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/auth/v1/user')) return Response.json({ id: 'reader-id' });
    if (url.pathname.endsWith('/rest/v1/user_roles')) return Response.json([{ role: 'reader', reporter_tier: null }]);
    if (url.pathname.endsWith('/rest/v1/profile_media_assets')) {
      written.push({ path: url.pathname, body: JSON.parse(String(init.body)), auth: init.headers.Authorization });
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected request ${url}`);
  });
  try {
    const response = await worker.fetch(new Request('https://media.dutimz.com/profile/upload', {
      method: 'POST',
      headers: { Origin: 'https://dutimz.com', Authorization: 'Bearer test-token', 'Content-Type': 'image/jpeg' },
      body: 'image-bytes',
    }), { ...env, SPOTLIGHT_BUCKET: bucket });
    assert.equal(response.status, 201, 'a member without a newsroom role may still upload their own picture');
    const payload = await response.json();
    assert.match(payload.url, /\/profile\/media\/[0-9a-f-]{36}$/, 'the picture is served from the profile route');
    assert.equal(puts.length, 1);
    assert.match(puts[0].key, /^profiles\/reader-id\//, 'the object is the uploader\'s own, under the profile prefix');
    assert.equal(written.length, 1);
    // The row goes to the profile table through the caller's own token: the Worker never
    // writes a member's picture as a news asset.
    assert.match(written[0].path, /profile_media_assets$/);
    assert.equal(written[0].body.owner_id, 'reader-id');
    assert.equal(written[0].body.id, payload.id);
    assert.equal(written[0].auth, 'Bearer test-token');
  } finally { restore(); }
});

test('a profile picture is served to anyone, and its key never leaves the server', async () => {
  const rpcs = [];
  const asset = {
    id: '00000000-0000-4000-8000-000000000000',
    owner_id: 'reader-id',
    original_key: 'profiles/reader-id/face.webp',
    derivative_key: null,
    mime_type: 'image/webp',
    original_bytes: 11,
    derivative_bytes: null,
  };
  const bucket = {
    get: async (key) => ({
      key,
      body: new Uint8Array([1, 2, 3]),
      httpEtag: '"etag-1"',
      writeHttpMetadata: (headers) => headers.set('Content-Type', 'image/webp'),
    }),
  };
  const restore = fetchAs(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/rest/v1/rpc/get_profile_media')) {
      rpcs.push(JSON.parse(String(init.body)));
      return Response.json(rpcs.length === 1 ? [asset] : []);
    }
    throw new Error(`Unexpected request ${url}`);
  });
  try {
    // Signed out: a face is public identity, so a visitor with no session still sees it.
    const served = await worker.fetch(new Request(`https://media.dutimz.com/profile/media/${asset.id}`), { ...env, SPOTLIGHT_BUCKET: bucket });
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('Content-Type'), 'image/webp');
    assert.equal(served.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(served.headers.get('Cache-Control'), /^public/, 'a signed-out visitor gets a cacheable picture');
    assert.equal(rpcs.length, 1);
    assert.equal(rpcs[0].p_media_id, asset.id, 'the object is resolved through the gate, by id');
    assert.doesNotMatch(JSON.stringify([...served.headers]), /profiles\/reader-id/, 'the R2 key is never handed to the client');
  } finally { restore(); }

  const rpcOnly = fetchAs(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/rest/v1/rpc/get_profile_media')) return Response.json([]);
    throw new Error(`Unexpected request ${url}`);
  });
  try {
    const missing = await worker.fetch(new Request(`https://media.dutimz.com/profile/media/${asset.id}`), env);
    assert.equal(missing.status, 404, 'an id no row owns resolves to nothing');
    const invalid = await worker.fetch(new Request('https://media.dutimz.com/profile/media/not-a-uuid'), env);
    assert.equal(invalid.status, 404);
  } finally { rpcOnly(); }
});

test('the writer form documents the upload gate: reporter role and image types only', async () => {
  // The media Worker itself enforces role + MIME server-side (proven above).
  // The Next.js writer form surfaces the same contract: submit_article refuses
  // non-reporters, and only image/* uploads are accepted. Gallery upload UI
  // arrives in a follow-up; the RPC already validates media ownership.
  const writer = await readFile(new URL('../components/account/writer-form.tsx', import.meta.url), 'utf8');
  assert.match(writer, /rpc\(['"]submit_article['"]/);
  assert.match(writer, /রিপোর্টার অনুমতি|reporter/i);
  const migration = await readFile(new URL('../supabase/migrations/202609290002_admin_byline_and_publish_date.sql', import.meta.url), 'utf8');
  assert.match(migration, /প্রতিবেদন জমা দিতে রিপোর্টার অনুমতি প্রয়োজন/);
  assert.match(migration, /mime_type like 'image\/%'/);
});
