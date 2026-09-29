import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

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
    'The moderation audit still records the real reporter behind the anonymous story',
    'Approving an anonymous story pays the reporter who filed it',
    'An admin edit of an anonymous story still records the real reporter',
    'Public search still finds an anonymous story and exposes no author with it',
  ];
  const missing = required.filter((description) => !suite.includes(description));
  assert.deepEqual(missing, [], `anonymity coverage disappeared: ${missing.join('; ')}`);
});

test('the member records rules keep their pgTAP coverage', () => {
  const required = [
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
    'Every member record change is written to the accountability log',
    'A member cannot change their own username through the profile API',
    "The desk can change another member''s username and correct their details together",
    'The log keeps what the desk saw as well as what it saved',
  ];
  const missing = required.filter((description) => !suite.includes(description));
  assert.deepEqual(missing, [], `member record coverage disappeared: ${missing.join('; ')}`);
  assert.ok(suite.includes('A member cannot change their own username through the profile API'));
  assert.ok(suite.includes("The desk can change another member''s username and correct their details together"));
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
