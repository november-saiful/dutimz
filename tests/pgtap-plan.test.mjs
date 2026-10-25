import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const MIGRATIONS_DIR = new URL('../supabase/migrations/', import.meta.url);

/**
 * The definition each function would have after every migration has run.
 *
 * A later migration may replace a body, and a PL/pgSQL body is only parsed when it is called, so
 * the file that defines a function is not necessarily the one that decides what it does today.
 */
async function latestFunctionBodies() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
  const latest = new Map();
  for (const file of files) {
    const sql = await readFile(new URL(file, MIGRATIONS_DIR), 'utf8');
    const definitions = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/gi;
    for (const match of sql.matchAll(definitions)) {
      const end = sql.indexOf('\n$$;', match.index);
      if (end === -1) continue;
      latest.set(match[1], sql.slice(match.index, end + 4));
    }
  }
  return latest;
}

// pgTAP needs a live Postgres, which this checkout cannot start locally (no Docker, no psql),
// so `supabase test db` only ever runs in CI. Two failures that can be caught without a
// database are still worth catching here: a plan that disagrees with the assertions written,
// and coverage for the anonymity rules quietly disappearing in a refactor.
const ASSERTION_FUNCTIONS = [
  'ok', 'is', 'isnt', 'is_empty', 'isnt_empty', 'results_eq', 'set_eq', 'bag_eq',
  'throws_ok', 'lives_ok', 'has_table', 'has_column', 'has_function', 'hasnt_function',
  'has_index', 'has_policy', 'policies_are', 'col_not_null', 'col_is_null', 'col_type_is',
  'matches', 'is_definer',
];
// Anchored to the start of a statement so the word "is" inside a description cannot be
// mistaken for the assertion of the same name.
const ASSERTION_STATEMENT = /^[ \t]*select[ \t]+([a-z_][a-z0-9_]*)[ \t]*\(/gim;

const suite = await readProjectFile('supabase/tests/dutimiz_rls.test.sql');

test('no live function still names a column or table this branch removed', async () => {
  // A PL/pgSQL body is parsed when it runs, not when it is created, so a function that still names
  // a dropped column applies cleanly and fails on its first call. CI caught exactly that: the two
  // triggers that release held earnings and the withdrawal request all still wrote
  // `earnings_ledger.reason` after the column was dropped.
  const forbidden = [
    ['p_reason', (body) => body.includes('p_reason')],
    ['rejection_reason', (body) => body.includes('rejection_reason')],
    ['review_reason', (body) => body.includes('review_reason')],
    ['admin_audit_log', (body) => body.includes('admin_audit_log')],
    ['moderation_actions', (body) => body.includes('moderation_actions')],
    ['reason', (body) => /\breason\b/.test(body)],
  ];
  const offenders = [];
  for (const [name, body] of await latestFunctionBodies()) {
    // Comments explain the removal and may name it; only live SQL matters.
    const sql = body.replace(/--[^\n]*/g, '');
    const hit = forbidden.find(([, matches]) => matches(sql));
    if (hit) offenders.push(`${name} names ${hit[0]}`);
  }
  assert.deepEqual(offenders, [], `a removed column or table is still in use: ${offenders.join('; ')}`);
});

test('the pgTAP plan counts exactly the assertions the suite runs', () => {
  const planned = Number(suite.match(/select\s+plan\(\s*(\d+)\s*\)/)[1]);
  const written = [...suite.matchAll(ASSERTION_STATEMENT)]
    .filter(([, fn]) => ASSERTION_FUNCTIONS.includes(fn.toLowerCase())).length;
  assert.equal(written, planned, `plan(${planned}) claims more or fewer assertions than the ${written} written`);
});

test('the anonymity rules keep their pgTAP coverage', () => {
  const required = [
    'A moderator cannot approve the anonymous story they filed themselves',
    'A signed-in member cannot write an attribution row to claim a story',
    'A signed-in member cannot move an anonymous story onto their own name',
    'Another signed-in member cannot read an anonymous story still waiting for the desk',
    'Another signed-in member reads no revision of an anonymous story',
    'The reporter reads every revision of their anonymous story, including the desk edits',
    'An anonymous submission can carry a photo gallery',
    'The filer can still read the gallery of their own unpublished anonymous story',
    'The named count alone sits below the threshold, so only the attributed stories can carry it',
    'The first withdrawal counts named and anonymously filed stories alike',
    'The reporter can read back their own attribution',
    'A moderator cannot read the attribution either; it belongs to the desk administrator',
    'A signed-out visitor cannot read the attribution table',
    'Approving an anonymous story credits nothing: the desk sets any amount for it',
    'Public search still finds an anonymous story and exposes no author with it',
  ];
  const missing = required.filter((description) => !suite.includes(description));
  assert.deepEqual(missing, [], `anonymity coverage disappeared: ${missing.join('; ')}`);
});

test('the member records rules keep their pgTAP coverage', () => {
  const required = [
    'The moderation log is gone',
    'The accountability log is gone',
    'A reporter cannot list the member records',
    'A reporter cannot edit another member record',
    'The desk sees every member with their role and how complete their record is',
    'The desk can fill in a single field',
    'A patch touches only the fields it carries',
    'An empty value is how the desk clears a field it filled in by mistake',
    'An unknown profile field is refused rather than dropped on the floor',
    'A derived field the desk must not set directly is refused',
    'A username already taken by another member is refused as a sentence, not an index violation',
    'A hall resident needs a hall name to go with it',
    'A payout method and its number have to arrive together',
    'A member cannot change their own username through the profile API',
    "The desk can change another member''s username and correct their details together",
  ];
  const missing = required.filter((description) => !suite.includes(description));
  assert.deepEqual(missing, [], `member record coverage disappeared: ${missing.join('; ')}`);
  assert.ok(suite.includes('A member cannot change their own username through the profile API'));
  assert.ok(suite.includes("The desk can change another member''s username and correct their details together"));
});

test('the excerpt, visibility and spotlight rules keep their pgTAP coverage', () => {
  const required = [
    "A derived excerpt collapses the body''s line breaks into single spaces",
    'A blank body derives no short description',
    'A short body is its own excerpt, unchanged',
    'A derived excerpt stays inside the column window however long the body',
    'A submission without a short description is accepted',
    'The stored excerpt is derived from the body',
    'The derived excerpt satisfies the column constraint',
    'The default visibility shows the bio and published work and hides the payout details',
    'A member may publish their own department and session',
    'The stored choice is read back',
    'An unknown visibility field is refused rather than silently dropped',
    'A visibility value that is not a boolean is refused',
    'The public profile exposes only the fields the member published',
    'An unknown username resolves to no public profile',
    'Identity stays public no matter how the visibility is set',
    'A signed-out visitor cannot post to Spotlight',
    'Spotlight object keys are never readable by a signed-out reader',
    'Any signed-in member can raise an issue in Spotlight',
    'The submitted photos are attached to the post',
    'A member cannot attach another member upload to their post',
    'A post may carry at most ten photos',
    'The desk can hide a Spotlight post',
    'The hidden post keeps its row so it can be restored',
    'A hidden post is gone from the public feed',
    'The author can still read their own hidden post',
    'A member cannot reverse a desk decision',
    'A member can post without photos',
    'A second member can post too',
    "A member cannot delete another member''s post",
    'An author can delete their own post',
    'The deleted post is gone',
    'The desk can restore a hidden post',
    'The desk can remove a post outright',
    'A post removed by the desk is gone',
  ];
  const missing = required.filter((description) => !suite.includes(description));
  assert.deepEqual(missing, [], `excerpt/visibility/spotlight coverage disappeared: ${missing.join('; ')}`);
});

test('spotlight moderation stays behind the audited RPCs and keeps media keys private', async () => {
  const migration = await readProjectFile('supabase/migrations/202610010004_spotlight_moderation.sql');
  // The first Spotlight migration granted anon select on the media table, which exposed the
  // private R2 object keys. The Worker resolves pictures through get_spotlight_media instead.
  assert.ok(
    migration.includes('revoke select on public.spotlight_media_assets from anon, authenticated;'),
    'spotlight object keys must not be readable by clients',
  );
  for (const fn of ['delete_my_spotlight_post', 'admin_set_spotlight_status']) {
    assert.ok(migration.includes(`function public.${fn}`), `${fn} should be defined`);
    assert.ok(
      migration.includes(`revoke all on function public.${fn}`),
      `${fn} should be revoked so it is not callable past its own guard`,
    );
  }
  assert.equal((migration.match(/security definer/g) ?? []).length, 2, 'both functions read tables the caller cannot');
  assert.ok(migration.includes("'moderate_spotlight'"), 'the decision should be written to the moderation log');
  assert.ok(migration.includes("check (status in ('visible', 'hidden'))"), 'hiding is a first-class state');
  assert.ok(migration.trimEnd().endsWith('commit;'), 'the migration should be atomic');
});

test('the admin console migration puts the wallet on the row and audits the status change', async () => {
  const migration = await readProjectFile('supabase/migrations/202610010005_admin_console_money_and_news.sql');
  // The wallet figures have to match the member's own balance page, which is the only reason the
  // id-paste box could be removed: the row the desk already sees now carries the money.
  for (const column of ['held_tk', 'available_tk', 'reserved_tk']) {
    assert.ok(migration.includes(column), `the member row must carry ${column}`);
  }
  // Changing a function's OUT columns is not a replaceable change: the old signature has to go
  // first or the create fails and takes the whole migration directory with it.
  assert.ok(
    migration.includes('drop function if exists public.admin_member_records'),
    'a changed return type needs the old signature dropped first',
  );
  assert.ok(migration.includes("'set_article_status'"), 'the new decision must satisfy the moderation log constraint');
  for (const fn of ['admin_member_records', 'admin_set_article_status']) {
    assert.ok(migration.includes(`function public.${fn}`), `${fn} should be defined`);
    assert.ok(
      migration.includes(`revoke all on function public.${fn}`),
      `${fn} should be revoked so it is not callable past its own guard`,
    );
  }
  assert.ok(migration.includes("using errcode = '42501'"), 'the new RPC refuses a caller who is not an administrator');
  assert.ok(migration.includes('public.add_article_earning'), 'a restored story still reaches the reporter');
  assert.ok(migration.trimEnd().endsWith('commit;'), 'the migration should be atomic');
});

test('the permanent delete is audited before the story disappears, and refuses a paid one', async () => {
  const migration = await readProjectFile('supabase/migrations/202610250001_admin_delete_article.sql');
  assert.ok(
    migration.includes('function public.admin_delete_article'),
    'the one way to erase a story should be defined',
  );
  assert.ok(
    migration.includes('revoke all on function public.admin_delete_article'),
    'the RPC should be revoked so it is not callable past its own guard',
  );
  assert.ok(migration.includes("using errcode = '42501'"), 'a caller who is not an administrator is refused');
  assert.ok(migration.includes("set search_path = ''"), 'a SECURITY DEFINER function must pin its search path');
  assert.ok(migration.includes("'delete_article'"), 'the deletion is written to the accountability log');
  // `earnings_ledger.article_id` is `on delete restrict`, so a paid story cannot be erased. The
  // function has to name that refusal instead of letting a foreign-key error surface.
  assert.ok(
    migration.includes('from public.earnings_ledger'),
    'a story that has already paid its author is refused in the function, not by the constraint',
  );
  // The audit row is written while the row still exists: it carries the title, the address and the
  // counts the cascade is about to take, and the log's target has no foreign key to follow.
  assert.ok(
    migration.indexOf('insert into public.admin_audit_log') < migration.indexOf('delete from public.articles'),
    'the audit row must be written before the story is gone',
  );
  assert.ok(migration.trimEnd().endsWith('commit;'), 'the migration should be atomic');
});

test('the member records migration stays administrator-only and off the dropped column', async () => {
  const migration = await readProjectFile('supabase/migrations/202609290003_admin_member_records.sql');
  // profile_details.completion_percent was dropped by 202609240003, so a query against it reads
  // from a column that no longer exists. Completion has to come from the live function.
  assert.ok(!/d\.completion_percent/.test(migration), 'the migration reads a column an earlier migration dropped');
  assert.ok(migration.includes('public.profile_completion_for(p.id)'), 'completion should come from the live function');
  assert.ok(migration.includes('(select count(*) from matching)'), 'the directory reports the total count for pagination');
  // A bare `select id` reads against the RETURNS TABLE column of the same name and aborts
  // the directory listing (CI run #26); the CTE column has to stay qualified.
  assert.ok(migration.includes('select matching.id from matching'), 'the directory filter must qualify the CTE column');
  assert.ok(!/\(select id from matching\)/.test(migration), 'no unqualified id may leak back into the directory filter');
  assert.ok(migration.includes('left join public.profile_details d on d.user_id = p.id'), 'directory pagination reads complete private details');
  assert.ok(migration.includes('order by p.created_at desc, p.id desc'), 'directory pagination has stable ordering for tied timestamps');
  assert.ok(migration.includes('p_offset'), 'the directory has an offset for pagination');
  assert.ok(migration.includes('revoke update (username) on public.profiles from authenticated;'));
  assert.ok(migration.includes('revoke update (username) on public.profiles from public, anon;'));
  for (const fn of ['admin_member_records', 'admin_update_member']) {
    assert.ok(migration.includes(`function public.${fn}`), `${fn} should be defined`);
    assert.ok(
      migration.includes(`revoke all on function public.${fn}`),
      `${fn} should be revoked so it is not callable past its own guard`,
    );
  }
  assert.equal((migration.match(/security definer/g) ?? []).length, 2, 'both functions read tables the caller cannot');
  assert.equal(
    (migration.match(/using errcode = '42501'/g) ?? []).length,
    2,
    'each function should refuse a caller who is not an administrator',
  );
  assert.ok(migration.includes("'update_member'"), 'the change should be written to the accountability log');
  assert.ok(migration.trimEnd().endsWith('commit;'), 'the migration should be atomic');
});

test('the spotlight lifecycle keeps its decisions audited and its statistics public', async () => {
  const lifecycle = await readProjectFile('supabase/migrations/202610020001_spotlight_issue_lifecycle.sql');
  assert.ok(lifecycle.includes('function public.mark_spotlight_issue'), 'the marking RPC should be defined');
  assert.ok(
    lifecycle.includes('revoke all on function public.mark_spotlight_issue'),
    'the RPC should be revoked so it is not callable past its own guard',
  );
  for (const state of ['open', 'in_progress', 'solved', 'invalid']) {
    assert.ok(lifecycle.includes(`'${state}'`), `${state} must be a recognised issue state`);
  }
  assert.ok(lifecycle.includes("'resolve_spotlight'"), 'the mark must satisfy the moderation log constraint');
  assert.ok(lifecycle.includes('spotlight_resolution_media'), 'proof pictures need their own attachment rows');
  assert.ok(lifecycle.includes('spotlight_issue_events'), 'every mark should append an event');
  assert.ok(lifecycle.includes('using errcode = \'42501\''), 'a non-author is refused');
  assert.ok(lifecycle.trimEnd().endsWith('commit;'), 'the migration should be atomic');

  const stats = await readProjectFile('supabase/migrations/202610020002_spotlight_statistics.sql');
  for (const fn of ['get_public_spotlight_stats', 'get_public_spotlight_solvers']) {
    assert.ok(stats.includes(`function public.${fn}`), `${fn} should be defined`);
    assert.ok(stats.includes(`revoke all on function public.${fn}`), `${fn} should be revoked`);
  }
  assert.ok(stats.includes('to anon, authenticated'), 'the statistics must be readable by anyone');
  assert.ok(stats.trimEnd().endsWith('commit;'), 'the migration should be atomic');

  const dashboard = await readProjectFile('supabase/migrations/202610020003_member_dashboard_articles.sql');
  assert.ok(dashboard.includes('function public.get_my_articles'), 'the dashboard needs its own news query');
  assert.ok(dashboard.includes('article_attributions'), 'anonymously filed stories still belong to their author');
  assert.ok(
    dashboard.includes('revoke all on function public.get_my_articles() from public, anon'),
    'one member\'s stories must not be readable by another',
  );
  assert.ok(dashboard.trimEnd().endsWith('commit;'), 'the migration should be atomic');
});

test('the article preview keeps an unpublished body to its author and the desk', async () => {
  const migration = await readProjectFile('supabase/migrations/202610030001_article_preview.sql');
  for (const fn of ['article_slug_exists', 'get_my_article_by_slug']) {
    assert.ok(migration.includes(`function public.${fn}`), `${fn} should be defined`);
    assert.ok(
      migration.includes(`revoke all on function public.${fn}`),
      `${fn} should be revoked so it is not callable past its own guard`,
    );
  }
  // Existence may be public; the body may not.
  assert.ok(migration.includes('to anon, authenticated'), 'a slug can be checked by anyone');
  assert.ok(migration.includes('from public, anon'), 'the body read is not granted to a visitor');
  assert.ok(migration.includes('is_moderator_or_admin()'), 'only the author or the desk may read it');
  assert.ok(
    migration.includes('article_attributions'),
    'an anonymously filed draft still belongs to its author',
  );
  assert.ok(migration.includes("set search_path = ''"), 'a SECURITY DEFINER function must pin its search path');
  assert.ok(migration.trimEnd().endsWith('commit;'), 'the migration should be atomic');
});
