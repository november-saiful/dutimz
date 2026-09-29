import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// The byline and the dateline are the two facts about a story that a reporter must not be able
// to rewrite. The pgTAP suite proves that against a real database; these checks catch the
// source-level regressions that would take the guarantee away again -- a guard deleted from
// the migration, a control that stops being admin-only, a date that stops being capped.
const MIGRATION = 'supabase/migrations/202609290002_admin_byline_and_publish_date.sql';
const sql = await readProjectFile(MIGRATION);
const client = await readProjectFile('src/scripts/client.ts');
const writePage = await readProjectFile('src/pages/account/write.astro');

// The body of one function, up to the closing of its dollar-quoted block.
function functionBody(name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start > -1, `${name} should be defined by this migration`);
  const end = sql.indexOf('$$;', start);
  assert.ok(end > start, `${name} should be a dollar-quoted function`);
  return sql.slice(start, end);
}

test('the byline and the publication date are admin-only at the database', () => {
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;$/m);

  // Filing on behalf of somebody else and choosing the moment it goes live both arrive with
  // the submission, and both are refused for anyone but an administrator.
  assert.match(sql, /drop function if exists public\.submit_article\(text, text, text, text, text, text, text\[\], jsonb, uuid, boolean\);/);
  const submit = functionBody('submit_article');
  assert.match(submit, /p_author_id uuid default null/);
  assert.match(submit, /p_published_at timestamptz default null/);
  assert.match(submit, /if \(p_author_id is not null or p_published_at is not null\) and not public\.is_admin\(\) then/);
  assert.match(submit, /raise exception 'লেখক নির্বাচন ও প্রকাশের সময় নির্ধারণ কেবল নির্বাহী করতে পারেন' using errcode = '42501'/);
  // The story belongs to the named author: byline, attribution and fee all follow them.
  assert.match(submit, /owner := coalesce\(p_author_id, actor\);/);
  assert.match(submit, /case when anonymous then null else owner end/);
  assert.match(submit, /values \(created\.id, owner\)/);
  assert.match(submit, /perform public\.add_article_earning\(created\.id, owner\)/);
  assert.match(submit, /'publish_on_behalf'/);

  // The desk operation is behind the same gate, and it accepts any status so a story can be
  // corrected before it is approved as well as after.
  const setPublication = functionBody('admin_set_article_publication');
  assert.match(setPublication, /if not public\.is_admin\(\) then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;/);
  assert.doesNotMatch(setPublication, /status <> 'published'/, 'a byline or a date must be fixable on a story that has not gone out yet');
  assert.match(setPublication, /previous_owner := coalesce\(target\.author_id,/);
  assert.match(setPublication, /least\(p_published_at, now\(\)\)/, 'a dateline ahead of the present has to be capped');
  assert.match(setPublication, /case when p_published_at is null then published_at else/, 'an omitted date must leave the existing dateline alone');
  // The row and the attribution table are two views of one fact, so they move together.
  assert.match(setPublication, /insert into public\.article_attributions \(article_id, author_id\) values \(p_article_id, next_owner\)\n      on conflict \(article_id\) do update set author_id = excluded\.author_id;/);
  assert.match(setPublication, /delete from public\.article_attributions where article_id = p_article_id;/);
  assert.match(setPublication, /'set_article_publication'/);
  assert.match(sql, /grant execute on function public\.admin_set_article_publication\(uuid, text, uuid, timestamptz, text\) to authenticated;/);
  assert.match(sql, /'edit_article', 'adjust_balance',\n    'set_article_publication'\)/, 'the moderation history needs the new action in its check constraint');
});

test('the desk keeps a dateline it set and can edit a story before it is published', () => {
  const moderate = functionBody('moderate_article');
  assert.match(moderate, /published_at = case when p_decision = 'approve' then coalesce\(target\.published_at, now\(\)\) else null end/);
  assert.doesNotMatch(moderate, /p_decision = 'approve' then now\(\)/, 'approval must not overwrite a dateline the desk chose');

  // The desk edit form used to insist on a published story, which silently broke its own edit
  // button in the moderation queue: editing a pending submission always failed.
  const update = functionBody('admin_update_article');
  assert.doesNotMatch(update, /status <> 'published'/);
});

test('the controls only ever appear for an administrator', () => {
  // The author picker is rendered inside the admin-only branch, so a moderator reviewing the
  // same queue never sees it, and the RPC refuses them if they call it anyway.
  assert.match(client, /const canEdit = authRole === 'admin';/);
  assert.match(client, /canEdit \? .*publicationFormMarkup\(/);
  assert.match(client, /if \(!supabase \|\| !authUser \|\| authRole !== 'admin'\) return setMessage\(error, 'এই পরিবর্তন কেবল প্রশাসক করতে পারেন।'\);/);
  assert.match(client, /supabase\.rpc\('admin_set_article_publication', \{/);
  assert.match(client, /p_byline: byline,/);
  assert.match(client, /p_author_id: byline === 'keep' \? null : \(authorId \|\| null\),/);
  // A reporter's own submission only sends the desk fields when the visitor is an admin.
  assert.match(client, /\.\.\.\(authRole === 'admin' && adminAuthor\?\.value \? \{ p_author_id: adminAuthor\.value \} : \{\}\),/);
  assert.match(client, /\.\.\.\(authRole === 'admin' && adminPublishedAt\?\.value \? \{ p_published_at: new Date\(adminPublishedAt\.value\)\.toISOString\(\) \} : \{\}\),/);

  // The write page offers the same two fields, hidden behind the shared admin-only toggle.
  assert.match(writePage, /<section class="editor-admin" data-admin-only hidden>/);
  assert.match(writePage, /<select name="author_id" data-admin-author-select>/);
  assert.match(writePage, /<input type="datetime-local" name="published_at" data-admin-published-at \/>/);
  // The browser refuses a future date; the server caps it again as the real guard.
  assert.match(client, /max="\$\{attr\(localDateTimeNow\(\)\)\}"/);
});

test('every author a byline can move to is an editorial account', () => {
  assert.match(client, /async function loadAuthorOptions\(\): Promise<AuthorOption\[\]> \{/);
  assert.match(client, /if \(!supabase \|\| authRole !== 'admin'\) return \[\];/);
  assert.match(client, /\.select\('user_id,role,profiles:profiles!user_roles_user_id_fkey\(username,display_name\)'\)/);
  assert.match(client, /\.in\('role', \['reporter', 'moderator', 'admin'\]\);/);
  // The story's existing author stays selectable even when their account is no longer an
  // editorial one, so saving a date never silently re-credits the story.
  assert.match(client, /if \(currentId && !options\.some\(\(option\) => option\.id === currentId\)\) \{/);
});

test('the pgTAP suite covers the refusals and the capability', async () => {
  const suite = await readProjectFile('supabase/tests/dutimiz_rls.test.sql');
  const required = [
    'A reporter cannot rewrite a byline, not even their own',
    'A reporter cannot file a story under an author they choose',
    'A reporter cannot choose when their story is dated',
    'The desk can publish a story credited to another reporter',
    'Publishing under another name is recorded for accountability',
    'The desk can move a byline to another author',
    'A credited story keeps no attribution row behind it',
    'The desk can withdraw a byline without losing the author',
    'Restoring the byline clears the stale attribution',
    'The desk can date a story while it still waits for approval',
    'Approval keeps the dateline the desk chose instead of stamping the moment of approval',
    'A publication date ahead of now is capped at the present',
    'Changing only the date leaves the byline where it was',
    'A byline or date change without a real reason is refused',
    'The desk can edit a story that has not been published yet',
  ];
  const missing = required.filter((description) => !suite.includes(description));
  assert.deepEqual(missing, [], `byline coverage disappeared: ${missing.join('; ')}`);
});
