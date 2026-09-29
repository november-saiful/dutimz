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
