import assert from 'node:assert/strict';
import { build } from 'esbuild';
import test from 'node:test';

const bundle = await build({ entryPoints: ['functions/u/[username].ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const routeModule = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { onRequestGet } = routeModule;

const env = { SUPABASE_URL: 'https://db.example.test', SUPABASE_ANON_KEY: 'public-anon-key' };
const context = (username) => ({ params: { username }, env });

function stubFetch(responses) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const response = responses.shift();
    if (!response) throw new Error('Unexpected fetch');
    return Response.json(response.body, { status: response.status ?? 200 });
  };
  return { requests, restore: () => { globalThis.fetch = originalFetch; } };
}

test('public profile route rejects malformed usernames without querying Supabase', async () => {
  const fetchStub = stubFetch([]);
  try {
    const response = await onRequestGet(context('../private'));
    assert.equal(response.status, 404);
    assert.match(await response.text(), /প্রোফাইল পাওয়া যায়নি/);
    assert.equal(fetchStub.requests.length, 0);
  } finally { fetchStub.restore(); }
});

test('public profile exposes public identity and published stories only', async () => {
  const fetchStub = stubFetch([
    { body: [{ id: 'profile-id', username: 'reader_abc123', display_name: 'পরীক্ষা পাঠক', bio: 'ক্যাম্পাসের পাঠক', avatar_url: null }] },
    { body: [{ id: 'story-id', slug: 'campus-story', title: 'ক্যাম্পাসের প্রতিবেদন', excerpt: 'প্রতিবেদনের পরিচিতি', published_at: '2026-09-20T10:00:00Z', category: { slug: 'campus', title_bn: 'ক্যাম্পাস' } }] },
  ]);
  try {
    const response = await onRequestGet(context('reader_abc123'));
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /প্রকাশিত প্রতিবেদন/);
    assert.match(html, /@reader_abc123/);
    assert.match(html, /ক্যাম্পাসের পাঠক/);
    assert.match(html, /ক্যাম্পাসের প্রতিবেদন/);
    assert.match(html, /href="\/u\/reader_abc123\/"/);
    assert.equal(fetchStub.requests.length, 2);
    assert.equal(fetchStub.requests[0].searchParams.get('username'), 'eq.reader_abc123');
    assert.equal(fetchStub.requests[1].searchParams.get('author_id'), 'eq.profile-id');
    assert.equal(fetchStub.requests[1].searchParams.get('status'), 'eq.published');
    for (const privateField of ['du_registration_number', 'whatsapp_number', 'payout_number', 'hall_name']) {
      assert.ok(!html.includes(privateField), `public response omits ${privateField}`);
    }
  } finally { fetchStub.restore(); }
});
