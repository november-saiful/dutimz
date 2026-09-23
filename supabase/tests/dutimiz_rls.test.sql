begin;
select plan(18);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'reader@test.dutimz.com', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"পরীক্ষা পাঠক"}', false, false),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'reporter@test.dutimz.com', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"পরীক্ষা সাংবাদিক"}', false, false),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'mod@test.dutimz.com', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"পরীক্ষা মডারেটর"}', false, false),
  ('10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'admin@test.dutimz.com', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"পরীক্ষা অ্যাডমিন"}', false, false)
on conflict (id) do nothing;

update public.user_roles set role = 'reporter', reporter_tier = 'junior' where user_id = '10000000-0000-4000-8000-000000000002';
update public.user_roles set role = 'moderator' where user_id = '10000000-0000-4000-8000-000000000003';
update public.user_roles set role = 'admin' where user_id = '10000000-0000-4000-8000-000000000004';

select has_table('public', 'profiles', 'Profiles table exists');
select has_table('public', 'profile_details', 'Private student profile table exists');
select has_table('public', 'user_roles', 'Role assignments live separately from public profile');
select has_table('public', 'articles', 'Articles table exists');
select has_table('public', 'article_revisions', 'Article revision history exists');
select has_table('public', 'moderation_actions', 'Moderation audit history exists');
select has_table('public', 'earnings_ledger', 'Earnings use an append-only ledger');
select has_table('public', 'withdrawals', 'Withdrawal requests are modeled');
select col_not_null('public', 'moderation_actions', 'reason', 'Moderation reason is mandatory');
select col_not_null('public', 'profiles', 'username', 'Every profile has a stable username');
select lives_ok($$select public.reporter_fee_for_tier('junior')$$, 'Junior reporters earn ৳90 per published article');
select results_eq($$select public.reporter_fee_for_tier('general')$$, $$values (115)$$, 'General reporters earn ৳115 per published article');
select results_eq($$select public.reporter_fee_for_tier('executive')$$, $$values (140)$$, 'Executive reporters earn ৳140 per published article');
select results_eq($$select public.profile_completion_for('10000000-0000-4000-8000-000000000001')$$, $$values (0)$$, 'An unfilled profile starts below the completion thresholds');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is_empty($$select user_id from public.profile_details where user_id = '10000000-0000-4000-8000-000000000002'$$, 'Readers cannot read another person’s private profile');
select is_empty($$select user_id from public.user_roles where user_id = '10000000-0000-4000-8000-000000000002'$$, 'Readers cannot inspect another person’s reporter assignment');
select throws_ok(
  $$insert into public.user_roles (user_id, role, reporter_tier) values ('10000000-0000-4000-8000-000000000001','admin',null)$$,
  '42501', null, 'Readers cannot self-promote via direct table writes'
);

select * from finish();
rollback;
