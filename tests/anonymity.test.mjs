import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// The public byline is rendered by four separate entry points (article, feed, category,
// profile). Bundling the real routes and feeding them real Supabase payloads is the only
// way to prove an anonymous story stays anonymous all the way to the HTML.
async function loadRoute(entry) {
  const bundle = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}

const articleRoute = await loadRoute('functions/news/[slug].ts');
const homeRoute = await loadRoute('functions/index.ts');
const categoryRoute = await loadRoute('functions/category/[slug].ts');

const ANONYMOUS_BYLINE = 'নাম প্রকাশে অনিচ্ছুক';
const env = { SUPABASE_URL: 'https://db.example.test', SUPABASE_ANON_KEY: 'public-anon-key' };

function stubFetch(responses) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(new URL(String(input)));
    const response = responses.shift();
    if (!response) throw new Error('Unexpected fetch');
    return Response.json(response.body, { status: response.status ?? 200 });
  };
  return { requests, restore: () => { globalThis.fetch = originalFetch; } };
}

const creditedProfile = { username: 'reader_abc123', display_name: 'পরীক্ষা রিপোর্টার', avatar_url: null };
const baseStory = {
  id: 'story-1',
  slug: 'campus-story',
  title: 'ক্যাম্পাসের প্রতিবেদন',
  excerpt: 'সংক্ষিপ্ত পরিচিতি',
  body: 'প্রথম অনুচ্ছেদ।\n\nদ্বিতীয় অনুচ্ছেদ।',
  hero_media_key: null,
  article_media: [],
  published_at: '2026-09-20T10:00:00Z',
  category: { slug: 'campus', title_bn: 'ক্যাম্পাস' },
};
const anonymousStory = { ...baseStory, id: 'story-anon', slug: 'unnamed-story', title: 'নামহীন প্রতিবেদন', author_id: null, is_anonymous: true, profiles: null };
const creditedStory = { ...baseStory, id: 'story-credit', author_id: 'profile-1', is_anonymous: false, profiles: creditedProfile };

const structuredData = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

test('an anonymous story shows no author anywhere on its article page', async () => {
  const fetchStub = stubFetch([{ body: [anonymousStory] }]);
  try {
    const response = await articleRoute.onRequestGet({ params: { slug: anonymousStory.slug }, env });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.ok(html.includes(ANONYMOUS_BYLINE), 'the byline should state the choice instead of a name');
    assert.match(html, /<strong class="story-byline--anonymous">/, 'the byline must not be a link');
    assert.ok(!html.includes('/u/'), 'an anonymous story must not carry a profile link');
    const ld = structuredData(html);
    assert.equal(ld.author['@type'], 'Person');
    assert.equal(ld.author.name, ANONYMOUS_BYLINE);
    assert.ok(!('url' in ld.author), 'structured data must not point search engines at the reporter');
  } finally { fetchStub.restore(); }
});

test('a credited story still links its reporter on the article page', async () => {
  const fetchStub = stubFetch([{ body: [creditedStory] }]);
  try {
    const response = await articleRoute.onRequestGet({ params: { slug: creditedStory.slug }, env });
    const html = await response.text();
    assert.match(html, /<a href="\/u\/reader_abc123\/"><strong>পরীক্ষা রিপোর্টার<\/strong><\/a>/);
    assert.ok(!html.includes('story-byline--anonymous'), 'a named story keeps its ordinary byline');
    const ld = structuredData(html);
    assert.equal(ld.author.name, 'পরীক্ষা রিপোর্টার');
    assert.equal(ld.author.url, 'https://dutimz.com/u/reader_abc123/');
  } finally { fetchStub.restore(); }
});

test('the feed hides anonymous credits in its story cards but keeps credited ones', async () => {
  const lead = { ...creditedStory, id: 'story-lead', slug: 'lead-story', title: 'প্রধান প্রতিবেদন' };
  const anonymousStub = stubFetch([{ body: [lead, anonymousStory] }]);
  try {
    const html = await (await homeRoute.onRequestGet({ request: new Request('https://dutimz.com/'), env })).text();
    assert.doesNotMatch(anonymousStub.requests[0].searchParams.get('select') ?? '', /\bbody\b/, 'the SSR feed should not transfer full story text');
    assert.match(html, /class="story-byline story-byline--anonymous"/);
    assert.ok(html.includes(ANONYMOUS_BYLINE));
    assert.match(html, /data-connected-carousel/);
    assert.match(html, /<article class="connected-carousel__slide connected-carousel__active is-active" data-carousel-item[^>]+id="connected-carousel-active" role="tabpanel" aria-labelledby=/);
    assert.match(html, /<h1 id="featured-title" data-carousel-title class="connected-carousel__caption">প্রধান প্রতিবেদন<\/h1>/);
    assert.ok((html.match(/data-carousel-item/g) ?? []).length >= 1, 'homepage should render selectable stories in the carousel');
    const carouselMarkup = html.slice(html.indexOf('<section class="connected-carousel-band"'), html.indexOf('</section>', html.indexOf('<section class="connected-carousel-band"')));
    assert.ok(carouselMarkup.includes('data-carousel-track'), 'news thumbnails are rendered on the sliding track');
    assert.doesNotMatch(carouselMarkup, /পরীক্ষা রিপোর্টার|data-author|data-quote|data-carousel-author|data-role/, 'the carousel must not render news authors or excerpts');
  } finally { anonymousStub.restore(); }
  const creditedStub = stubFetch([{ body: [lead, { ...creditedStory, id: 'story-side', slug: 'side-story' }] }]);
  try {
    const html = await (await homeRoute.onRequestGet({ request: new Request('https://dutimz.com/'), env })).text();
    assert.match(html, /href="\/u\/reader_abc123\/"/);
    assert.ok(!html.includes('story-byline--anonymous'));
  } finally { creditedStub.restore(); }
});

test('the homepage carousel uses real hero images with prioritized first covers and lazy later covers', async () => {
  const stories = [0, 1, 2].map((index) => ({
    ...creditedStory,
    id: `image-${index}`,
    slug: `image-story-${index}`,
    title: `ছবির প্রতিবেদন ${index + 1}`,
    hero_media_key: `hero-${index}.jpg`,
  }));
  const fetchStub = stubFetch([{ body: stories }]);
  try {
    const html = await (await homeRoute.onRequestGet({ request: new Request('https://dutimz.com/'), env })).text();
    assert.match(html, /src="https:\/\/media\.dutimz\.com\/media\/hero-0\.jpg" alt="ছবির প্রতিবেদন 1" loading="eager" fetchpriority="high" decoding="async"/);
    assert.match(html, /src="https:\/\/media\.dutimz\.com\/media\/hero-1\.jpg" alt="ছবির প্রতিবেদন 2" loading="lazy" decoding="async"/);
    assert.match(html, /src="https:\/\/media\.dutimz\.com\/media\/hero-2\.jpg" alt="ছবির প্রতিবেদন 3" loading="lazy" decoding="async"/);
    assert.ok(!html.includes('fetchpriority="high" loading="lazy"'), 'only the eager first thumbnail may claim high priority');
  } finally { fetchStub.restore(); }
});

test('the homepage redirects www requests to the apex and preserves path/query', async () => {
  const response = await homeRoute.onRequestGet({
    request: new Request('https://www.dutimz.com/?source=share'),
    env: { ...env, ASSETS: { fetch: async () => { throw new Error('Should not fetch assets'); } } },
  });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('Location'), 'https://dutimz.com/?source=share');
});

test('the homepage serves the static asset shell when its database request fails', async () => {
  const fetchStub = stubFetch([{ body: { message: 'database unavailable' }, status: 503 }]);
  let assetRequest;
  const assets = { fetch: async (request) => { assetRequest = request; return new Response('static shell'); } };
  try {
    const response = await homeRoute.onRequestGet({
      request: new Request('https://dutimz.com/'),
      env: { ...env, ASSETS: assets },
    });
    assert.equal(await response.text(), 'static shell');
    assert.equal(fetchStub.requests.length, 1, 'the error fallback must not re-enter the homepage function');
    assert.equal(new URL(String(assetRequest)).pathname, '/', 'the static homepage asset should be requested');
  } finally { fetchStub.restore(); }
});

test('a category listing keeps anonymous stories without their authors', async () => {
  const fetchStub = stubFetch([
    { body: [{ slug: 'campus', title_bn: 'ক্যাম্পাস', description_bn: '' }] },
    { body: [anonymousStory, creditedStory] },
  ]);
  try {
    const response = await categoryRoute.onRequestGet({ params: { slug: 'campus' }, env });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.ok(html.includes(anonymousStory.title), 'anonymous stories must still be listed');
    assert.match(html, /<span class="story-byline story-byline--anonymous">/);
    assert.equal((html.match(/\/u\//g) ?? []).length, 1, 'only the credited story may link to a profile');
    assert.match(html, /href="\/u\/reader_abc123\/"/);
  } finally { fetchStub.restore(); }
});

test('the migration moves authorship out of the public article row', async () => {
  const sql = await readProjectFile('supabase/migrations/202609290001_anonymous_article_authors.sql');
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;$/m);
  // The identity has to leave the publicly readable column, or hiding the byline in the
  // interface would hide nothing.
  assert.match(sql, /alter table public\.articles add column is_anonymous boolean not null default false;/);
  assert.match(sql, /alter table public\.articles alter column author_id drop not null;/);
  assert.match(sql, /alter table public\.articles add constraint articles_author_matches_anonymity\s+check \(is_anonymous = \(author_id is null\)\);/);
  // ...into a table only the author and the desk can read.
  assert.match(sql, /create table public\.article_attributions \(\s*article_id uuid primary key references public\.articles\(id\) on delete cascade,\s*author_id uuid not null references public\.profiles\(id\) on delete restrict,/);
  assert.match(sql, /alter table public\.article_attributions enable row level security;/);
  assert.match(sql, /revoke all on public\.article_attributions from anon, authenticated;/);
  assert.match(sql, /create policy article_attribution_read on public\.article_attributions for select to authenticated\s+using \(author_id = \(select auth\.uid\(\)\) or \(select public\.is_admin\(\)\)\);/);
  assert.match(sql, /grant select on public\.article_attributions to authenticated;/);
  assert.doesNotMatch(sql, /grant [^;]* on public\.article_attributions to[^;]*anon/);
  // The author still owns their unpublished and pending stories, including its media.
  assert.match(sql, /create policy articles_attributed_author_read on public\.articles for select to authenticated\s+using \(exists \(select 1 from public\.article_attributions aa\s+where aa\.article_id = articles\.id and aa\.author_id = \(select auth\.uid\(\)\)\)\);/);
  assert.match(sql, /create policy article_media_attributed_author_read on public\.article_media for select to authenticated/);
  assert.match(sql, /create policy revisions_attributed_author_read on public\.article_revisions for select to authenticated/);
});

test('the flag travels with the submission and pays the reporter who filed it', async () => {
  const sql = await readProjectFile('supabase/migrations/202609290001_anonymous_article_authors.sql');
  const submit = sql.slice(sql.indexOf('create or replace function public.submit_article'), sql.indexOf('create or replace function public.moderate_article'));
  // The nine-argument overload is dropped so a caller cannot quietly file as named.
  assert.match(sql, /drop function if exists public\.submit_article\(text, text, text, text, text, text, text\[\], jsonb, uuid\);/);
  assert.match(submit, /p_is_anonymous boolean default false/);
  assert.match(submit, /anonymous boolean := coalesce\(p_is_anonymous, false\);/);
  assert.match(submit, /values \(case when anonymous then null else actor end, category,/);
  assert.match(submit, /insert into public\.article_attributions \(article_id, author_id\) values \(created\.id, actor\);/);
  assert.match(submit, /revoke all on function public\.submit_article\(text, text, text, text, text, text, text\[\], jsonb, uuid, boolean\) from public, anon;/);
  assert.match(submit, /grant execute on function public\.submit_article\(text, text, text, text, text, text, text\[\], jsonb, uuid, boolean\) to authenticated;/);
  // The earning follows the attribution, not the (now null) byline column.
  assert.match(submit, /if created\.status = 'published' then perform public\.add_article_earning\(created\.id, actor\); end if;/);
});

test('every desk-side consumer resolves the owner through the attribution', async () => {
  const sql = await readProjectFile('supabase/migrations/202609290001_anonymous_article_authors.sql');
  const ownerFromAttribution = /owner_id := coalesce\(target\.author_id, \(select aa\.author_id from public\.article_attributions aa where aa\.article_id = p_article_id\)\);/;
  const moderate = sql.slice(sql.indexOf('create or replace function public.moderate_article'), sql.indexOf('create or replace function public.update_own_article'));
  assert.match(moderate, ownerFromAttribution);
  assert.match(moderate, /if owner_id = actor and p_decision = 'approve' then raise exception/);
  assert.match(moderate, /add_article_earning\(p_article_id, owner_id\)/);
  const adminEdit = sql.slice(sql.indexOf('create or replace function public.admin_update_article'), sql.indexOf('create or replace function public.update_own_article'));
  assert.match(adminEdit, ownerFromAttribution);
  assert.match(adminEdit, /values \(actor, 'edit_article', p_article_id, owner_id, trim\(p_reason\),/);
  const update = sql.slice(sql.indexOf('create or replace function public.update_own_article'), sql.indexOf('create or replace function public.request_withdrawal'));
  assert.match(update, ownerFromAttribution);
  assert.match(update, /owner_id is distinct from actor/);
  // Anonymous stories are still the reporter's work, so the first-withdrawal gate counts them.
  const withdrawal = sql.slice(sql.indexOf('create or replace function public.request_withdrawal'), sql.indexOf('create or replace function public.search_public_articles'));
  assert.match(withdrawal, /or exists \(select 1 from public\.article_attributions aa where aa\.article_id = a\.id and aa\.author_id = actor\)/);
});

test('search keeps anonymous stories it would otherwise drop', async () => {
  const sql = await readProjectFile('supabase/migrations/202609290001_anonymous_article_authors.sql');
  const search = sql.slice(sql.indexOf('create or replace function public.search_public_articles'), sql.indexOf('revoke all on function public.search_public_articles'));
  assert.match(search, /is_anonymous boolean,/);
  assert.match(search, /left join public\.profiles p on p\.id = a\.author_id/);
  assert.doesNotMatch(search, /(?<!left )join public\.profiles/, 'an inner join would delete every anonymous story from search');
  assert.match(search, /case when p\.id is null then null/);
  assert.match(sql, /drop function if exists public\.search_public_articles\(text, integer\);/);
  assert.match(sql, /grant execute on function public\.search_public_articles\(text, integer\) to anon, authenticated;/);
});

test('the editor asks once, and the request carries the answer', async () => {
  const write = await readProjectFile('src/pages/account/write.astro');
  assert.match(write, /<input type="checkbox" name="is_anonymous">/);
  assert.match(write, /editor-anonymous/);
  const client = await readProjectFile('src/scripts/client.ts');
  assert.match(client, /const ANONYMOUS_BYLINE = /);
  assert.match(client, /function bylineMarkup\(/);
  assert.match(client, /anonymousToggle\?\.checked \?\? false/);
  assert.match(client, /p_is_anonymous: anonymousToggle\?\.checked \?\? false/);
  assert.match(client, /from\('article_attributions'\)\.select\('article_id'\)\.eq\('author_id', authUser\.id\)/);
  // Every byline reaches the DOM through one of these helpers, so an anonymous story
  // cannot pick up a profile link anywhere in the interface.
  assert.match(client, /function authorCreditMarkup\(/);
  assert.match(client, /\$\{authorCreditMarkup\(author\)\}/);
  assert.match(client, /\$\{bylineMarkup\(author\)\}/);
  assert.doesNotMatch(client, /article-author-info"><a href="\/u\//);
  assert.match(client, /\$\{article\.is_anonymous \? anonymousCredit\(/);
  const css = await readProjectFile('public/site.css');
  assert.match(css, /\.story-byline--anonymous \{/);
  assert.match(css, /\.anon-badge \{/);
  assert.match(css, /\.editor-anonymous \{/);
});

test('a moderator who cannot read the attribution is not shown an invented name', async () => {
  const client = await readProjectFile('src/scripts/client.ts');
  assert.match(client, /function anonymousCredit\(name: string \| null\)/);
  assert.match(client, /attributed\.get\(article\.id\) \?\? null/);
  assert.match(client, /article\.is_anonymous \? anonymousCredit\(profile \? publicName\(profile\) : null\)/);
  assert.doesNotMatch(client, /attributed\.get\(article\.id\) \?\? \{ username: '', display_name:/);
});
