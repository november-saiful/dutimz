import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [page, client, migration, pgtap] = await Promise.all([
  readProjectFile('src/pages/account/admin.astro'),
  readProjectFile('src/scripts/client.ts'),
  readProjectFile('supabase/migrations/202609290003_admin_member_records.sql'),
  readProjectFile('supabase/tests/dutimiz_rls.test.sql'),
]);

test('the admin people tab lists members and exposes the complete editable record', () => {
  assert.match(page, /data-admin-user-search/);
  assert.match(page, /data-admin-user-results/);
  assert.match(page, /data-admin-user-prev/);
  assert.match(page, /data-admin-user-next/);
  assert.match(page, /data-member-editor-panel hidden/);
  for (const field of [
    'username', 'display_name', 'bio', 'avatar_url', 'role', 'reporter_tier', 'department', 'session',
    'du_registration_number', 'residency_status', 'hall_name', 'whatsapp_number', 'whatsapp_na',
    'payout_method', 'payout_number', 'reason',
  ]) assert.ok(page.includes(`name="${field}"`), `the editor should include ${field}`);
});

test('the directory loads every matching account through the protected, paginated RPC', () => {
  assert.match(client, /supabase!\.rpc\('admin_member_records', \{ p_query: query\.trim\(\) \|\| null, p_limit: pageSize, p_offset: pageOffset \}\)/);
  assert.match(client, /totalCount = Number\(pageRows\[0\]\?\.total_count \?\? 0\)/);
  assert.match(client, /nextPage\?\.addEventListener\('click'/);
  assert.match(client, /previousPage\?\.addEventListener\('click'/);
  assert.match(client, /async function loadMembers/);
  assert.match(client, /if \(!supabase \|\| !authUser \|\| authRole !== 'admin'\) return;/);
});

test('only an admin can change a username through the audited member RPC', () => {
  assert.match(migration, /revoke update \(username\) on public\.profiles from authenticated;/);
  assert.match(migration, /admin_member_records\(p_query text default null, p_limit integer default 50, p_offset integer default 0\)/);
  assert.match(migration, /if not public\.is_admin\(\) then raise exception .*using errcode = '42501'; end if;/g);
  assert.match(migration, /allowed_profile text\[\] := array\['username', 'display_name', 'bio', 'avatar_url'\]/);
  assert.match(migration, /update public\.profiles set\s+username = next_username/);
  assert.match(migration, /insert into public\.admin_audit_log[\s\S]*'update_member'/);
  assert.match(pgtap, /A member cannot change their own username through the profile API/);
  assert.match(pgtap, /The desk can change another member''s username and correct their details together/);
});
