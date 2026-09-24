begin;
select plan(59);

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
  ('11000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'reader@test.dutimz.com', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"পরীক্ষা পাঠক"}', false, false),
  ('22000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'reporter@test.dutimz.com', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"পরীক্ষা সাংবাদিক"}', false, false),
  ('33000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'mod@test.dutimz.com', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"পরীক্ষা মডারেটর"}', false, false),
  ('44000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'admin@test.dutimz.com', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"পরীক্ষা অ্যাডমিন"}', false, false)
on conflict (id) do nothing;

update public.user_roles set role = 'reporter', reporter_tier = 'junior' where user_id = '22000000-0000-4000-8000-000000000002';
update public.user_roles set role = 'moderator' where user_id = '33000000-0000-4000-8000-000000000003';
update public.user_roles set role = 'admin' where user_id = '44000000-0000-4000-8000-000000000004';

-- Administrator bootstrap. The administrator role is policy-driven data, so the portal can
-- have more than one owner instead of racing for a single claim.
select results_eq($$select cardinality(public.bootstrap_admin_list())$$, $$values (0)$$, 'No administrator is configured until the list is set');

-- Two accounts sign in before any list exists: both are ordinary readers.
insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
  ('77000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'late-admin@test.dutimz.com', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"দেরিতে যোগ দেওয়া প্রশাসক"}', false, false),
  ('88000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'reconciled-admin@test.dutimz.com', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"পুনর্মিলিত প্রশাসক"}', false, false)
on conflict (id) do nothing;
select results_eq(
  $$select role from public.user_roles where user_id = '77000000-0000-4000-8000-000000000007'$$,
  $$values ('reader'::public.app_role)$$,
  'An address that is not listed yet signs in as a reader'
);

-- A configured list is parsed, normalised and applied.
update public.app_settings set value = 'du-admin@test.dutimz.com, late-admin@test.dutimz.com, reconciled-admin@test.dutimz.com' where key = 'bootstrap_admin_emails';
insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
  ('55000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'du-admin@test.dutimz.com', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"প্রথম প্রশাসক"}', false, false),
  ('66000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'plain-reader@test.dutimz.com', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"সাধারণ পাঠক"}', false, false)
on conflict (id) do nothing;
select results_eq(
  $$select role from public.user_roles where user_id = '55000000-0000-4000-8000-000000000005'$$,
  $$values ('admin'::public.app_role)$$,
  'A listed address holds the administrator role from its first sign-in'
);
select results_eq(
  $$select role from public.user_roles where user_id = '66000000-0000-4000-8000-000000000006'$$,
  $$values ('reader'::public.app_role)$$,
  'An address outside the list still signs in as a reader'
);
select ok(
  public.bootstrap_admin_list() @> array['late-admin@test.dutimz.com', 'reconciled-admin@test.dutimz.com'],
  'Every address in the configured list is recognised, including the last one'
);

-- A listed administrator whose account predates the configuration can still recover the role.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '77000000-0000-4000-8000-000000000007', true);
select results_eq($$select public.bootstrap_admin_accounts()$$, $$values (1)$$, 'A listed account promotes itself when its role predates the configuration');
select results_eq(
  $$select role from public.user_roles where user_id = '77000000-0000-4000-8000-000000000007'$$,
  $$values ('admin'::public.app_role)$$,
  'The self-promoted account is an administrator'
);
select results_eq($$select public.bootstrap_admin_accounts()$$, $$values (0)$$, 'An administrator calling the bootstrap again changes nothing');
select set_config('request.jwt.claim.sub', '66000000-0000-4000-8000-000000000006', true);
select results_eq($$select public.bootstrap_admin_accounts()$$, $$values (0)$$, 'A reader outside the list cannot promote anyone through the bootstrap');
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Out of band (SQL editor or the release workflow) every configured address is reconciled.
select results_eq($$select public.bootstrap_admin_accounts()$$, $$values (1)$$, 'Reconciliation promotes the configured account that already existed');
select results_eq(
  $$select role from public.user_roles where user_id = '88000000-0000-4000-8000-000000000008'$$,
  $$values ('admin'::public.app_role)$$,
  'The reconciled account holds the administrator role'
);
select results_eq(
  $$select count(*)::int from public.admin_audit_log where action = 'bootstrap_admin'$$,
  $$values (3)$$,
  'Every administrator granted by the bootstrap is audited'
);
select hasnt_function('public', 'bootstrap_first_admin', 'The single-shot administrator claim is retired');

-- Normalisation, and the list as the single source of administrators.
update public.app_settings set value = 'du-admin@test.dutimz.com, not-an-address, DU-ADMIN@test.dutimz.com' where key = 'bootstrap_admin_emails';
select results_eq(
  $$select public.bootstrap_admin_list()$$,
  $$select array['du-admin@test.dutimz.com']::text[]$$,
  'A malformed entry is ignored and a repeated address collapses into one'
);
select is_empty(
  $$select key from public.app_settings where key in ('initial_admin_email', 'initial_admin_claimed')$$,
  'The retired single-address settings are gone, so the list is the only administrator source'
);
insert into public.app_settings (key, value) values ('initial_admin_email', 'stray@test.dutimz.com');
select results_eq(
  $$select public.bootstrap_admin_list()$$,
  $$select array['du-admin@test.dutimz.com']::text[]$$,
  'A stray legacy address cannot smuggle an administrator into the list'
);

-- The panel shows the configured addresses, but only to administrators.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select results_eq(
  $$select public.admin_bootstrap_addresses()$$,
  $$select array['du-admin@test.dutimz.com']::text[]$$,
  'An administrator can read the configured administrator addresses'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select is_empty(
  $$select unnest(public.admin_bootstrap_addresses())$$,
  'A reader cannot enumerate the configured administrator addresses'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);

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
select results_eq($$select public.profile_completion_for('11000000-0000-4000-8000-000000000001')$$, $$values (13)$$, 'A fresh signup sits at 13% (display name only, one of eight fields) and stays below the prompt threshold');

-- Slugs come from the Bengali headline, never from the reporter.
select results_eq($$select public.slugify_title('ঢাকা')$$, $$values ('dhaka')$$, 'A Bengali headline transliterates into a Latin slug');
select results_eq($$select public.slugify_title('সংবাদ')$$, $$values ('songbad')$$, 'Inherent vowels and the anusvara romanise readably');
select results_eq($$select public.slugify_title('DU Campus News 2026')$$, $$values ('du-campus-news-2026')$$, 'Latin words in a headline are preserved');
select ok(public.bengali_to_latin('ঢাকা বিশ্ববিদ্যালয়: ২০২৬!') ~ '^[[:ascii:]]+$', 'Transliteration emits ASCII only');
select ok(public.slugify_title('ঢাকা বিশ্ববিদ্যালয়ে সাংবাদিকতা ও ক্যাম্পাস জীবন') ~ '^[a-z0-9]+(-[a-z0-9]+)*$', 'Generated slugs satisfy the articles.slug format');

insert into public.categories (slug, title_bn, description_bn, sort_order)
  values ('porikkha', 'পরীক্ষা', 'পরীক্ষার বিভাগ', 90)
  on conflict (slug) do nothing;
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, published_at)
  select '22000000-0000-4000-8000-000000000002', c.id, 'songbad', 'পরীক্ষামূলক সংবাদ শিরোনাম',
         'পরীক্ষার জন্য লেখা সংক্ষিপ্ত পরিচিতি', repeat('পরীক্ষামূলক প্রতিবেদনের অংশ। ', 6), 'published', now()
    from public.categories c where c.slug = 'porikkha';
select results_eq($$select public.allocate_article_slug('সংবাদ')$$, $$values ('songbad-2')$$, 'A repeated headline claims the next free suffix');

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select lives_ok($$select * from public.list_corrections(5)$$, 'Anyone can read the public corrections feed');
select throws_ok($$select id from public.article_revisions$$, '42501', null, 'Anonymous readers cannot read the raw revision history');

-- The public read policies call the role helpers, so a role that cannot execute them cannot
-- query the table at all. These four reads failed with 42501 before migration 006 while the
-- signed-out site was live.
select lives_ok($$select slug from public.articles$$, 'A signed-out visitor can open the published article feed');
select lives_ok($$select slug from public.categories$$, 'A signed-out visitor can list the sections');
select lives_ok($$select id from public.comments$$, 'A signed-out visitor can read visible comments');
select lives_ok($$select article_id from public.reactions$$, 'A signed-out visitor can read reactions on published articles');
select results_eq(
  $$select count(*) from public.articles$$,
  $$values (1::bigint)$$,
  'The article feed is filtered to published rows rather than refused outright'
);
select is_empty($$select id from public.articles where status = 'pending'$$, 'Anonymous readers never see a submission awaiting moderation');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is_empty($$select user_id from public.profile_details where user_id = '22000000-0000-4000-8000-000000000002'$$, 'Readers cannot read another person’s private profile');
select is_empty($$select user_id from public.user_roles where user_id = '22000000-0000-4000-8000-000000000002'$$, 'Readers cannot inspect another person’s reporter assignment');
select throws_ok(
  $$insert into public.user_roles (user_id, role, reporter_tier) values ('11000000-0000-4000-8000-000000000001','admin',null)$$,
  '42501', null, 'Readers cannot self-promote via direct table writes'
);

-- Earnings, withdrawal, and moderation rules from the launch plan. These run
-- against the fixtures above: article 'songbad' belongs to the junior reporter
-- (10000000-...-0002), 'porikkha-mod' belongs to the moderator (...-0003).
reset role;
select set_config('request.jwt.claim.sub', '', true);
select public.add_article_earning((select id from public.articles where slug = 'songbad'), '22000000-0000-4000-8000-000000000002');
select public.add_article_earning((select id from public.articles where slug = 'songbad'), '22000000-0000-4000-8000-000000000002');
select results_eq(
  $$select count(*)::int, coalesce(sum(amount_tk), 0)::int from public.earnings_ledger where article_id = (select id from public.articles where slug = 'songbad') and entry_type in ('article_earning_held', 'article_earning_available')$$,
  $$values (1, 90)$$,
  'A published article earns its junior fee exactly once and is held while the profile is incomplete'
);

update public.profile_details set
  department = 'পরীক্ষামূলক বিভাগ', session = '২০২০-২১', du_registration_number = '২০২০-১২৩৪৫',
  residency_status = 'off_campus', whatsapp_na = true, payout_method = 'bkash', payout_number = '01700000000'
  where user_id = '22000000-0000-4000-8000-000000000002';
select results_eq(
  $$select public.profile_completion_for('22000000-0000-4000-8000-000000000002')$$, $$values (100)$$,
  'Every applicable field filled reaches 100% without a hall or a WhatsApp number'
);
select results_eq(
  $$select count(*)::int, coalesce(sum(amount_tk), 0)::int from public.earnings_ledger where article_id = (select id from public.articles where slug = 'songbad') and entry_type = 'profile_release'$$,
  $$values (1, 90)$$,
  'Completing the profile releases the held fee once, as its own append-only ledger entry'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select public.request_withdrawal(2500, 'bkash', '01700000000')$$, 'P0001', null, 'A withdrawal below the ৳3,000 minimum is refused');
select throws_ok($$select public.request_withdrawal(3500, 'bkash', '01700000000')$$, 'P0001', null, 'A first withdrawal is refused below 35 published articles');

reset role;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select public.admin_adjust_balance('22000000-0000-4000-8000-000000000002', 5000, 'পরীক্ষামূলক ব্যালেন্স সমন্বয়');
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, published_at)
  select '22000000-0000-4000-8000-000000000002', c.id, 'porikkha-' || g, 'পরীক্ষামূলক সংবাদ ' || g,
         'পরীক্ষামূলক সংক্ষিপ্ত পরিচিতি ' || g, repeat('পরীক্ষামূলক প্রতিবেদনের অংশ। ', 6), 'published', now()
    from public.categories c cross join generate_series(1, 34) as g
   where c.slug = 'porikkha';

set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select lives_ok($$select public.request_withdrawal(3000, 'bkash', '01700000000')$$, 'A reporter with a complete profile, 35 published articles and enough balance may withdraw');
select results_eq($$select (public.get_my_wallet() ->> 'reserved')::int$$, $$values (3000)$$, 'A pending request reserves exactly the requested amount');

reset role;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select public.review_withdrawal((select id from public.withdrawals where user_id = '22000000-0000-4000-8000-000000000002' and status = 'pending'), 'rejected', 'পরীক্ষামূলক প্রত্যাখ্যান');
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select results_eq($$select (public.get_my_wallet() ->> 'reserved')::int$$, $$values (0)$$, 'Rejecting a request gives the reserved money back to the reporter');

reset role;
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '33000000-0000-4000-8000-000000000003', c.id, 'porikkha-mod', 'মডারেটরের নিজের অপেক্ষমাণ প্রতিবেদন',
         'পরীক্ষামূলক সংক্ষিপ্ত পরিচিতি', repeat('পরীক্ষামূলক প্রতিবেদনের অংশ। ', 6), 'pending'
    from public.categories c where c.slug = 'porikkha';
set local role authenticated;
select set_config('request.jwt.claim.sub', '33000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.moderate_article((select id from public.articles where slug = 'porikkha-mod'), 'approve', 'নিজের প্রতিবেদন অনুমোদনের চেষ্টা')$$,
  '42501', null, 'A moderator cannot approve their own submission'
);
select throws_ok(
  $$select public.moderate_article((select id from public.articles where slug = 'porikkha-mod'), 'approve', 'ab')$$,
  'P0001', null, 'A moderation decision without a real reason is refused'
);

select * from finish();
rollback;
