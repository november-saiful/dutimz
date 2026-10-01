begin;
select plan(185);

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
select results_eq(
  $$select username from public.profiles where id = '77000000-0000-4000-8000-000000000007'$$,
  $$values ('reader_7700000000004000')$$,
  'Every newly created account receives a stable public profile username'
);
select results_eq(
  $$select count(*)::int from public.profile_details where user_id = '77000000-0000-4000-8000-000000000007'$$,
  $$values (1)$$,
  'Every newly created account receives its separate private profile details row'
);
select results_eq(
  $$select count(*)::int from public.user_roles where user_id = '77000000-0000-4000-8000-000000000007'$$,
  $$values (1)$$,
  'Every newly created account receives its own application role row'
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
  $$select username from public.profiles where id = '88000000-0000-4000-8000-000000000008'$$,
  $$values ('reader_8800000000004000')$$,
  'An account reconciled by the administrator bootstrap already has its public profile'
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
select results_eq(
  $$select count(*)::int from auth.users u join public.profiles p on p.id = u.id$$,
  $$select count(*)::int from auth.users$$,
  'Every existing account has a public profile row'
);
select results_eq(
  $$select count(distinct username)::int from public.profiles$$,
  $$select count(*)::int from public.profiles$$,
  'Every account public profile has a unique username'
);
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
select results_eq(
  $$select username from public.profiles where id = '11000000-0000-4000-8000-000000000001'$$,
  $$values ('reader_1100000000004000')$$,
  'A signed-out visitor can load a member by their public username'
);
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

-- Photo galleries: R2 images attach to a story in submission order, a reader only
-- ever sees the gallery of a published story, and only the uploader's own images
-- can be pinned to their submission.
reset role;
select set_config('request.jwt.claim.sub', '', true);
select has_table('public', 'article_media', 'A story gallery of R2 images is modeled');
select has_table('public', 'article_questionnaire_responses', 'Sensitive questionnaire responses are stored separately from public story rows');
insert into public.media_assets (id, owner_id, original_key, mime_type, original_bytes) values
  ('91000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002', 'originals/reporter/gallery-songbad.jpg', 'image/jpeg', 123456),
  ('91000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000003', 'originals/mod/gallery-pending.jpg', 'image/jpeg', 234567)
on conflict (id) do nothing;
insert into public.article_media (article_id, media_id, position)
  select a.id, '91000000-0000-4000-8000-000000000001', 0 from public.articles a where a.slug = 'songbad'
on conflict do nothing;
insert into public.article_media (article_id, media_id, position)
  select a.id, '91000000-0000-4000-8000-000000000002', 0 from public.articles a where a.slug = 'porikkha-mod'
on conflict do nothing;

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select results_eq(
  $$select count(*) from public.article_media$$,
  $$values (1::bigint)$$,
  'A signed-out reader sees only the published story gallery'
);
select throws_ok(
  $$insert into public.article_media (article_id, media_id, position) select a.id, '91000000-0000-4000-8000-000000000001', 3 from public.articles a where a.slug = 'songbad'$$,
  '42501', null,
  'Readers cannot write gallery rows directly'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.submit_article('porikkha', 'গ্যালারি সহ নতুন প্রতিবেদন', 'গ্যালারি সহ প্রতিবেদনের সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), null, null, array['91000000-0000-4000-8000-000000000001'], '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে","criminal_activity":"না","activity_type":"প্রতিবাদ","activity_details":"শিক্ষার্থীদের শান্তিপূর্ণ কর্মসূচি"}'::jsonb, (select id from public.article_questionnaire_versions where active))$$,
  'A reporter submits a story with an ordered photo gallery'
);
select results_eq(
  $$select count(*) from public.article_media am join public.articles a on a.id = am.article_id where a.title = 'গ্যালারি সহ নতুন প্রতিবেদন'$$,
  $$values (1::bigint)$$,
  'The submitted gallery is attached to the new story'
);
select is_empty(
  $$select article_id from public.article_questionnaire_responses r join public.articles a on a.id = r.article_id where a.title = 'গ্যালারি সহ নতুন প্রতিবেদন'$$,
  'A reporter cannot read private questionnaire responses through the table'
);
reset role;
select results_eq(
  $$select count(*) from public.article_questionnaire_responses r join public.articles a on a.id = r.article_id where a.title = 'গ্যালারি সহ নতুন প্রতিবেদন' and r.answers->>'activity_type' = 'প্রতিবাদ'$$,
  $$values (1::bigint)$$,
  'The submission saves its validated questionnaire answers'
);
set local role authenticated;
select throws_ok(
  $$select * from public.get_article_questionnaire_responses(10)$$,
  '42501', null,
  'A reporter cannot read private questionnaire responses'
);
select throws_ok(
  $$select public.submit_article('porikkha', 'অন্য의 ছবি পিন করার চেষ্টা', 'অন্যের ছবি পিন করার চেষ্টার সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), null, null, array['91000000-0000-4000-8000-000000000002'], '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে","criminal_activity":"না","activity_type":"প্রতিবাদ","activity_details":"পরীক্ষা"}'::jsonb, (select id from public.article_questionnaire_versions where active))$$,
  'P0001', null,
  'A reporter cannot pin another author upload to a story'
);

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$select count(*) from public.article_media$$,
  $$values (1::bigint)$$,
  'The pending story gallery stays hidden from readers'
);
select throws_ok(
  $$select count(*) from public.article_questionnaire_responses$$,
  '42501', null,
  'Readers cannot query private questionnaire responses'
);
select ok(
  not (public.get_public_article_questionnaire_stats() ? 'answers')
  and not (public.get_public_article_questionnaire_stats() ? 'responses')
  and not (public.get_public_article_questionnaire_stats()::text like '%পরীক্ষা সাংবাদিক%')
  and (public.get_public_article_questionnaire_stats() #>> '{fields,0,submissions}') is null,
  'Public questionnaire statistics contain no identities and suppress small groups'
);
reset role;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select count(*) from public.get_article_questionnaire_responses(10)$$,
  $$values (1::bigint)$$,
  'Administrators can read submitted questionnaire details'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Anonymous filing. The publishable key is handed to every browser, so a byline that only
-- the interface hides is not hidden at all: the identity leaves articles.author_id and moves
-- to a table only the reporter and the desk administrator may read, while the fee and the
-- self-approval guard keep resolving the real reporter through that attribution.
select has_table('public', 'article_attributions', 'The real author of an anonymous story is recorded out of band');
select has_column('public', 'articles', 'is_anonymous', 'A story records that its byline is withheld');
select is(
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'articles' and column_name = 'author_id'),
  'YES',
  'An anonymous story cannot keep an author on its own public row'
);

-- The two representations of authorship cannot drift apart in either direction.
select throws_ok(
  $$insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, published_at, is_anonymous)
      select '22000000-0000-4000-8000-000000000002', c.id, 'porikkha-bad-anon', 'অসঙ্গত নামহীন প্রতিবেদন',
             'পরীক্ষামূলক সংক্ষিপ্ত পরিচিতি', repeat('পরীক্ষামূলক প্রতিবেদনের অংশ। ', 6), 'published', now(), true
        from public.categories c where c.slug = 'porikkha'$$,
  '23514', null,
  'A story cannot be anonymous while it still names its author'
);
select throws_ok(
  $$insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, published_at, is_anonymous)
      select null, c.id, 'porikkha-bad-credit', 'লেখকহীন অথচ নামযুক্ত প্রতিবেদন',
             'পরীক্ষামূলক সংক্ষিপ্ত পরিচিতি', repeat('পরীক্ষামূলক প্রতিবেদনের অংশ। ', 6), 'published', now(), false
        from public.categories c where c.slug = 'porikkha'$$,
  '23514', null,
  'A named story must keep its author'
);

-- The reporter files anonymously; the flag has to travel with the submission itself.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$select author_id is null, is_anonymous from public.submit_article('porikkha', 'নামহীন পরীক্ষামূলক প্রতিবেদন', 'নামহীন প্রতিবেদনের সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), null, null, null, '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে","criminal_activity":"না","activity_type":"প্রতিবাদ","activity_details":"পরীক্ষা"}'::jsonb, (select id from public.article_questionnaire_versions where active), true)$$,
  $$values (true, true)$$,
  'An anonymous submission comes back with no author on it and the flag set'
);
select results_eq(
  $$select author_id is null, is_anonymous, status::text from public.articles where title = 'নামহীন পরীক্ষামূলক প্রতিবেদন'$$,
  $$values (true, true, 'pending')$$,
  'The anonymous story is stored without an author and waits for the desk'
);
select results_eq(
  $$select count(*)::int from public.article_attributions aa join public.articles a on a.id = aa.article_id
     where a.title = 'নামহীন পরীক্ষামূলক প্রতিবেদন' and aa.author_id = '22000000-0000-4000-8000-000000000002'$$,
  $$values (1)$$,
  'The reporter can read back their own attribution'
);
select results_eq(
  $$select count(*)::int from public.articles where title = 'নামহীন পরীক্ষামূলক প্রতিবেদন'$$,
  $$values (1)$$,
  'The reporter still owns the unpublished anonymous story through the attribution policy'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select is_empty(
  $$select article_id from public.article_attributions$$,
  'Another signed-in member cannot learn who filed an anonymous story'
);
select set_config('request.jwt.claim.sub', '33000000-0000-4000-8000-000000000003', true);
select is_empty(
  $$select article_id from public.article_attributions$$,
  'A moderator cannot read the attribution either; it belongs to the desk administrator'
);
select lives_ok(
  $$select public.moderate_article((select id from public.articles where title = 'নামহীন পরীক্ষামূলক প্রতিবেদন'), 'approve', 'নামহীন প্রতিবেদন যাচাই করে অনুমোদন')$$,
  'A moderator approves an anonymous story without ever seeing the byline'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$select status::text, author_id is null from public.articles where title = 'নামহীন পরীক্ষামূলক প্রতিবেদন'$$,
  $$values ('published', true)$$,
  'The approved anonymous story is published with no author on its public row'
);
select results_eq(
  $$select target_user_id from public.moderation_actions
     where action = 'approve_article' and article_id = (select id from public.articles where title = 'নামহীন পরীক্ষামূলক প্রতিবেদন')$$,
  $$values ('22000000-0000-4000-8000-000000000002'::uuid)$$,
  'The moderation audit still records the real reporter behind the anonymous story'
);
select results_eq(
  $$select count(*)::int, coalesce(sum(amount_tk), 0)::int from public.earnings_ledger
     where article_id = (select id from public.articles where title = 'নামহীন পরীক্ষামূলক প্রতিবেদন')
       and user_id = '22000000-0000-4000-8000-000000000002'$$,
  $$values (1, 90)$$,
  'Approving an anonymous story pays the reporter who filed it'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select public.admin_update_article((select id from public.articles where title = 'নামহীন পরীক্ষামূলক প্রতিবেদন'), 'নামহীন পরীক্ষামূলক প্রতিবেদন', 'নামহীন প্রতিবেদনের হালনাগাদ পরিচিতি', repeat('হালনাগাদ প্রতিবেদনের অংশ। ', 8), 'সম্পাদকীয় হালনাগাদ ও যাচাই')$$,
  'The desk can edit an anonymous story without disturbing its byline'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$select target_user_id from public.moderation_actions
     where action = 'edit_article' and article_id = (select id from public.articles where title = 'নামহীন পরীক্ষামূলক প্রতিবেদন')$$,
  $$values ('22000000-0000-4000-8000-000000000002'::uuid)$$,
  'An admin edit of an anonymous story still records the real reporter'
);

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$select count(*)::int, bool_and(author_id is null) from public.search_public_articles('নামহীন', 10)$$,
  $$values (1, true)$$,
  'Public search still finds an anonymous story and exposes no author with it'
);
select throws_ok(
  $$select * from public.article_attributions$$,
  '42501', null,
  'A signed-out visitor cannot read the attribution table'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- The attribution is the only record of authorship an anonymous story has, so the guard,
-- the withdrawal gate and every read policy hinge on it. These assertions exist to fail the
-- moment that hinge is loosened, which is why they sit on the exact edge cases.
reset role;
select set_config('request.jwt.claim.sub', '', true);
-- A moderator files anonymously, then tries to wave their own report through. The guard used
-- to read author_id, which an anonymous story does not have, so this is the precise hole the
-- attribution closes.
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, is_anonymous)
  select null, c.id, 'porikkha-mod-anon', 'মডারেটরের নামহীন অপেক্ষমাণ প্রতিবেদন',
         'পরীক্ষামূলক সংক্ষিপ্ত পরিচিতি', repeat('পরীক্ষামূলক প্রতিবেদনের অংশ। ', 6), 'pending', true
    from public.categories c where c.slug = 'porikkha';
insert into public.article_attributions (article_id, author_id)
  select a.id, '33000000-0000-4000-8000-000000000003'::uuid from public.articles a where a.slug = 'porikkha-mod-anon';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '33000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.moderate_article((select id from public.articles where slug = 'porikkha-mod-anon'), 'approve', 'নিজের নামহীন প্রতিবেদন অনুমোদনের চেষ্টা')$$,
  '42501', null,
  'A moderator cannot approve the anonymous story they filed themselves'
);

-- Attribution rows are evidence, not client data: only the audited SECURITY DEFINER functions
-- may write one, so a member can neither claim a story nor move one onto their own name.
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$insert into public.article_attributions (article_id, author_id)
      values ('00000000-0000-4000-8000-000000000000', '22000000-0000-4000-8000-000000000002')$$,
  '42501', null,
  'A signed-in member cannot write an attribution row to claim a story'
);
select throws_ok(
  $$update public.article_attributions set author_id = '22000000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'A signed-in member cannot move an anonymous story onto their own name'
);

-- The filer keeps full access and nobody else gets any: the anonymous story, the revision
-- history the desk wrote while editing it, and its still-unpublished gallery stay with the
-- reporter alone.
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select is_empty(
  $$select id from public.articles where slug = 'porikkha-mod-anon'$$,
  'Another signed-in member cannot read an anonymous story still waiting for the desk'
);
select is_empty(
  $$select r.id from public.article_revisions r join public.articles a on a.id = r.article_id
     where a.title = 'নামহীন পরীক্ষামূলক প্রতিবেদন'$$,
  'Another signed-in member reads no revision of an anonymous story'
);
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$select count(*)::int from public.article_revisions r join public.articles a on a.id = r.article_id
     where a.title = 'নামহীন পরীক্ষামূলক প্রতিবেদন'$$,
  $$values (3)$$,
  'The reporter reads every revision of their anonymous story, including the desk edits'
);
select lives_ok(
  $$select public.submit_article('porikkha', 'নামহীন গ্যালারি প্রতিবেদন', 'নামহীন গ্যালারি প্রতিবেদনের সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), null, null, array['91000000-0000-4000-8000-000000000001'], '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে","criminal_activity":"না","activity_type":"প্রতিবাদ","activity_details":"পরীক্ষা"}'::jsonb, (select id from public.article_questionnaire_versions where active), true)$$,
  'An anonymous submission can carry a photo gallery'
);
select results_eq(
  $$select count(*)::int from public.article_media am join public.articles a on a.id = am.article_id
     where a.title = 'নামহীন গ্যালারি প্রতিবেদন'$$,
  $$values (1)$$,
  'The filer can still read the gallery of their own unpublished anonymous story'
);

-- The first-withdrawal gate counts the reporter published work. Two of the reporter 35 named
-- stories become anonymous, which drops the named count below the threshold: only resolving
-- through the attribution can keep the withdrawal open.
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.articles set author_id = null, is_anonymous = true where slug in ('porikkha-1', 'porikkha-2');
insert into public.article_attributions (article_id, author_id)
  select a.id, '22000000-0000-4000-8000-000000000002'::uuid from public.articles a where a.slug in ('porikkha-1', 'porikkha-2');
select results_eq(
  $$select count(*)::int from public.articles where author_id = '22000000-0000-4000-8000-000000000002' and status = 'published'$$,
  $$values (33)$$,
  'The named count alone sits below the threshold, so only the attributed stories can carry it'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.request_withdrawal(3000, 'bkash', '01700000000')$$,
  'The first withdrawal counts named and anonymously filed stories alike'
);

-- The byline and the dateline are facts about a story, so only the desk may rewrite them:
-- a reporter files as themselves, and a reporter who sends the fields is refused rather than
-- quietly ignored. These assertions cover both halves -- the refusal and the capability.
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, published_at)
  select '22000000-0000-4000-8000-000000000002', c.id, 'porikkha-byline', 'বাইলাইন পরীক্ষার প্রতিবেদন',
         'পরীক্ষামূলক সংক্ষিপ্ত পরিচিতি', repeat('পরীক্ষামূলক প্রতিবেদনের অংশ। ', 6), 'published', now()
    from public.categories c where c.slug = 'porikkha';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '22000000-0000-4000-8000-000000000002', c.id, 'porikkha-dateline', 'প্রকাশের সময় পরীক্ষার প্রতিবেদন',
         'পরীক্ষামূলক সংক্ষিপ্ত পরিচিতি', repeat('পরীক্ষামূলক প্রতিবেদনের অংশ। ', 6), 'pending'
    from public.categories c where c.slug = 'porikkha';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.admin_set_article_publication((select id from public.articles where slug = 'porikkha-byline'), 'author', '22000000-0000-4000-8000-000000000002', null, 'নিজের নামে বদলানোর চেষ্টা')$$,
  '42501', null,
  'A reporter cannot rewrite a byline, not even their own'
);
select throws_ok(
  $$select public.submit_article('porikkha', 'অন্যের নামে জমা দেওয়ার চেষ্টা', 'পরীক্ষামূলক সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), null, null, null, '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে","criminal_activity":"না","activity_type":"প্রতিবাদ","activity_details":"পরীক্ষা"}'::jsonb, (select id from public.article_questionnaire_versions where active), false, '33000000-0000-4000-8000-000000000003')$$,
  '42501', null,
  'A reporter cannot file a story under an author they choose'
);
select throws_ok(
  $$select public.submit_article('porikkha', 'সময় নির্ধারণের চেষ্টা', 'পরীক্ষামূলক সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), null, null, null, '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে","criminal_activity":"না","activity_type":"প্রতিবাদ","activity_details":"পরীক্ষা"}'::jsonb, (select id from public.article_questionnaire_versions where active), false, null, now() - interval '1 day')$$,
  '42501', null,
  'A reporter cannot choose when their story is dated'
);

-- The desk files the same story under another reporter's name. The story belongs to that
-- reporter from here on: byline, attribution and fee all follow the named author rather than
-- the account that pressed publish.
reset role;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select author_id, is_anonymous from public.submit_article('porikkha', 'অন্যের নামে প্রকাশিত প্রতিবেদন', 'পরীক্ষামূলক সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), null, null, null, '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে","criminal_activity":"না","activity_type":"প্রতিবাদ","activity_details":"পরীক্ষা"}'::jsonb, (select id from public.article_questionnaire_versions where active), false, '22000000-0000-4000-8000-000000000002')$$,
  $$values ('22000000-0000-4000-8000-000000000002'::uuid, false)$$,
  'The desk can publish a story credited to another reporter'
);
reset role;
select results_eq(
  $$select count(*)::int, coalesce(sum(amount_tk), 0)::int from public.earnings_ledger
     where article_id = (select id from public.articles where title = 'অন্যের নামে প্রকাশিত প্রতিবেদন')
       and user_id = '22000000-0000-4000-8000-000000000002'
       and entry_type in ('article_earning_held', 'article_earning_available')$$,
  $$values (1, 90)$$,
  'A story published on another reporter behalf pays that reporter, not the desk'
);
select results_eq(
  $$select count(*)::int from public.admin_audit_log
     where action = 'publish_on_behalf' and target_id = (select id from public.articles where title = 'অন্যের নামে প্রকাশিত প্রতিবেদন')$$,
  $$values (1)$$,
  'Publishing under another name is recorded for accountability'
);

-- Re-bylining an already published story: the credited row moves and no stale attribution is
-- left behind, which is the state articles_author_matches_anonymity exists to protect.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select public.admin_set_article_publication((select id from public.articles where slug = 'porikkha-byline'), 'author', '33000000-0000-4000-8000-000000000003', null, 'বাইলাইন সংশোধন')$$,
  'The desk can move a byline to another author'
);
reset role;
select results_eq(
  $$select author_id, is_anonymous from public.articles where slug = 'porikkha-byline'$$,
  $$values ('33000000-0000-4000-8000-000000000003'::uuid, false)$$,
  'The reassigned byline is credited to the new author on the public row'
);
select is_empty(
  $$select article_id from public.article_attributions where article_id = (select id from public.articles where slug = 'porikkha-byline')$$,
  'A credited story keeps no attribution row behind it'
);
select results_eq(
  $$select count(*)::int from public.moderation_actions
     where action = 'set_article_publication' and article_id = (select id from public.articles where slug = 'porikkha-byline')$$,
  $$values (1)$$,
  'The byline change appears in the moderation history'
);

-- Withdrawing a byline has to keep the author on file -- the desk still needs to know who was
-- paid and who to ask -- and crediting it again must clear that record rather than leave it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select public.admin_set_article_publication((select id from public.articles where slug = 'porikkha-byline'), 'anonymous', null, null, 'লেখকের অনুরোধে নাম প্রত্যাহার')$$,
  'The desk can withdraw a byline without losing the author'
);
reset role;
select results_eq(
  $$select a.author_id is null, a.is_anonymous, aa.author_id from public.articles a
      join public.article_attributions aa on aa.article_id = a.id
     where a.slug = 'porikkha-byline'$$,
  $$values (true, true, '33000000-0000-4000-8000-000000000003'::uuid)$$,
  'Withdrawing a byline moves the author into the attribution and off the public row'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select public.admin_set_article_publication((select id from public.articles where slug = 'porikkha-byline'), 'author', '22000000-0000-4000-8000-000000000002', null, 'পুনরায় নাম প্রকাশ')$$,
  'The desk can credit an anonymous story again'
);
reset role;
select is_empty(
  $$select article_id from public.article_attributions where article_id = (select id from public.articles where slug = 'porikkha-byline')$$,
  'Restoring the byline clears the stale attribution'
);

-- Dating a story before it is approved: the chosen dateline has to survive approval instead of
-- being overwritten by the moment somebody got round to pressing approve.
set local role authenticated;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select public.admin_set_article_publication((select id from public.articles where slug = 'porikkha-dateline'), 'keep', null, timestamptz '2026-08-15 09:00:00+00', 'প্রকাশের সময় নির্ধারণ')$$,
  'The desk can date a story while it still waits for approval'
);
select lives_ok(
  $$select public.moderate_article((select id from public.articles where slug = 'porikkha-dateline'), 'approve', 'নির্ধারিত তারিখে অনুমোদন')$$,
  'A dated pending story can still be approved'
);
reset role;
select results_eq(
  $$select status::text, published_at = timestamptz '2026-08-15 09:00:00+00' from public.articles where slug = 'porikkha-dateline'$$,
  $$values ('published', true)$$,
  'Approval keeps the dateline the desk chose instead of stamping the moment of approval'
);

-- A date ahead of the present is capped, so a story can never claim to have gone live later
-- than it did; a date-only change leaves the byline exactly where it was.
set local role authenticated;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select public.admin_set_article_publication((select id from public.articles where slug = 'porikkha-byline'), 'keep', null, now() + interval '400 days', 'ভবিষ্যতের তারিখ নির্ধারণের চেষ্টা')$$,
  'The desk can send any date and the operation still succeeds'
);
reset role;
select results_eq(
  $$select published_at <= now() from public.articles where slug = 'porikkha-byline'$$,
  $$values (true)$$,
  'A publication date ahead of now is capped at the present'
);
select results_eq(
  $$select author_id from public.articles where slug = 'porikkha-byline'$$,
  $$values ('22000000-0000-4000-8000-000000000002'::uuid)$$,
  'Changing only the date leaves the byline where it was'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select public.admin_set_article_publication((select id from public.articles where slug = 'porikkha-byline'), 'keep', null, null, 'ab')$$,
  'P0001', null,
  'A byline or date change without a real reason is refused'
);
-- The desk edit form used to insist on a published story, which broke its own edit button in
-- the moderation queue: editing a pending submission always came back as not found.
select lives_ok(
  $$select public.admin_update_article((select id from public.articles where slug = 'porikkha-mod'), 'মডারেটরের নিজের অপেক্ষমাণ প্রতিবেদন', 'পরীক্ষামূলক সংক্ষিপ্ত পরিচিতি', repeat('পরীক্ষামূলক প্রতিবেদনের অংশ। ', 6), 'অপেক্ষমাণ অবস্থায় সম্পাদকীয় সংশোধন')$$,
  'The desk can edit a story that has not been published yet'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- The desk reads and corrects member records. profile_details is owner-only at the table level,
-- so this is the only door into another member's record and it is checked on both sides: who may
-- open it, and what may be written through it.
reset role;
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select count(*) from public.admin_member_records(null, 50)$$,
  '42501', null,
  'A reporter cannot list the member records'
);
select throws_ok(
  $$select public.admin_update_member('11000000-0000-4000-8000-000000000001', '{"display_name":"অননুমোদিত পরিবর্তন"}'::jsonb, '{}'::jsonb, 'অননুমোদিত সম্পাদনার চেষ্টা')$$,
  '42501', null,
  'A reporter cannot edit another member record'
);
select throws_ok(
  $$update public.profiles set username = 'reporter_new_name' where id = '22000000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'A member cannot change their own username through the profile API'
);

reset role;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$select role::text, completion_percent, total_count from public.admin_member_records('reader_1100000000004000', 10, 0)$$,
  $$values ('reader', 13, 1::bigint)$$,
  'The desk sees every member with their role and how complete their record is'
);
select lives_ok(
  $$select public.admin_update_member('11000000-0000-4000-8000-000000000001', '{"username":"staff_reader","display_name":"সংশোধিত পাঠক নাম"}'::jsonb, '{"department":"সংশোধিত বিভাগ","session":"২০২৪-২৫"}'::jsonb, 'সদস্যের তথ্য সংশোধন')$$,
  'The desk can change another member''s username and correct their details together'
);
reset role;
select results_eq(
  $$select p.username, p.display_name, d.department, d.session from public.profiles p
      join public.profile_details d on d.user_id = p.id
     where p.id = '11000000-0000-4000-8000-000000000001'$$,
  $$values ('staff_reader', 'সংশোধিত পাঠক নাম', 'সংশোধিত বিভাগ', '২০২৪-২৫')$$,
  'The corrected member record is stored'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select public.admin_update_member('11000000-0000-4000-8000-000000000001', '{}'::jsonb, '{"hall_name":"পরীক্ষামূলক হল"}'::jsonb, 'হলের নাম যোগ')$$,
  'The desk can fill in a single field'
);
reset role;
select results_eq(
  $$select d.hall_name, p.display_name from public.profiles p
      join public.profile_details d on d.user_id = p.id
     where p.id = '11000000-0000-4000-8000-000000000001'$$,
  $$values ('পরীক্ষামূলক হল', 'সংশোধিত পাঠক নাম')$$,
  'A patch touches only the fields it carries'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select public.admin_update_member('11000000-0000-4000-8000-000000000001', '{}'::jsonb, '{"hall_name":""}'::jsonb, 'ভুল তথ্য মুছে ফেলা')$$,
  'An empty value is how the desk clears a field it filled in by mistake'
);
reset role;
select results_eq(
  $$select d.hall_name is null, d.department from public.profile_details d where d.user_id = '11000000-0000-4000-8000-000000000001'$$,
  $$values (true, 'সংশোধিত বিভাগ')$$,
  'Clearing one field leaves the rest of the record alone'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select public.admin_update_member('11000000-0000-4000-8000-000000000001', '{"nickname":"x"}'::jsonb, '{}'::jsonb, 'অচেনা ঘরের চেষ্টা')$$,
  'P0001', null,
  'An unknown profile field is refused rather than dropped on the floor'
);
select throws_ok(
  $$select public.admin_update_member('11000000-0000-4000-8000-000000000001', '{}'::jsonb, '{"completion_percent":100}'::jsonb, 'নিষিদ্ধ ঘরের চেষ্টা')$$,
  'P0001', null,
  'A derived field the desk must not set directly is refused'
);
select throws_ok(
  $$select public.admin_update_member('11000000-0000-4000-8000-000000000001', jsonb_build_object('username', (select username from public.profiles where id = '22000000-0000-4000-8000-000000000002')), '{}'::jsonb, 'ইউজারনেম সংঘর্ষের চেষ্টা')$$,
  'P0001', null,
  'A username already taken by another member is refused as a sentence, not an index violation'
);
select throws_ok(
  $$select public.admin_update_member('11000000-0000-4000-8000-000000000001', '{}'::jsonb, '{"residency_status":"hall_resident"}'::jsonb, 'হল ছাড়া আবাসিক')$$,
  'P0001', null,
  'A hall resident needs a hall name to go with it'
);
select throws_ok(
  $$select public.admin_update_member('11000000-0000-4000-8000-000000000001', '{}'::jsonb, '{"payout_method":"bkash"}'::jsonb, 'নম্বর ছাড়া পেমেন্ট পদ্ধতি')$$,
  'P0001', null,
  'A payout method and its number have to arrive together'
);
select throws_ok(
  $$select public.admin_update_member('00000000-0000-4000-8000-000000000000', '{}'::jsonb, '{}'::jsonb, 'অজানা সদস্য')$$,
  'P0001', null,
  'Editing a member who does not exist is refused'
);
select throws_ok(
  $$select public.admin_update_member('11000000-0000-4000-8000-000000000001', '{}'::jsonb, '{}'::jsonb, 'ab')$$,
  'P0001', null,
  'A member record change without a real reason is refused'
);
reset role;
select ok(
  (select count(*) from public.admin_audit_log where action = 'update_member' and target_id = '11000000-0000-4000-8000-000000000001') >= 3,
  'Every member record change is written to the accountability log'
);
select ok(
  (select details ? 'profile_before' and details ? 'profile_after' and details ? 'details_before'
     from public.admin_audit_log where action = 'update_member' and target_id = '11000000-0000-4000-8000-000000000001'
    order by created_at limit 1),
  'The log keeps what the desk saw as well as what it saved'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- The short description is derived from the body, never typed by the reporter.
reset role;
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$select public.derive_excerpt(E'প্রথম লাইন\n\nদ্বিতীয় লাইন')$$,
  $$values ('প্রথম লাইন দ্বিতীয় লাইন')$$,
  'A derived excerpt collapses the body''s line breaks into single spaces'
);
select results_eq(
  $$select public.derive_excerpt('   ')$$,
  $$values ('')$$,
  'A blank body derives no short description'
);
select results_eq(
  $$select public.derive_excerpt('সংক্ষিপ্ত বাক্য')$$,
  $$values ('সংক্ষিপ্ত বাক্য')$$,
  'A short body is its own excerpt, unchanged'
);
select ok(
  char_length(public.derive_excerpt(repeat('এটি একটি বাক্য। ', 40))) <= 240,
  'A derived excerpt stays inside the column window however long the body'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.submit_article('porikkha', 'সংক্ষিপ্ত বর্ণনা ছাড়া প্রতিবেদন', null, repeat('প্রতিবেদনের অংশ। ', 8), null, null, null, '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে","criminal_activity":"না","activity_type":"প্রতিবাদ","activity_details":"পরীক্ষা"}'::jsonb, (select id from public.article_questionnaire_versions where active))$$,
  'A submission without a short description is accepted'
);
reset role;
select results_eq(
  $$select a.excerpt from public.articles a where a.title = 'সংক্ষিপ্ত বর্ণনা ছাড়া প্রতিবেদন'$$,
  $$select public.derive_excerpt(a.body) from public.articles a where a.title = 'সংক্ষিপ্ত বর্ণনা ছাড়া প্রতিবেদন'$$,
  'The stored excerpt is derived from the body'
);
select ok(
  (select char_length(a.excerpt) between 10 and 280 from public.articles a where a.title = 'সংক্ষিপ্ত বর্ণনা ছাড়া প্রতিবেদন'),
  'The derived excerpt satisfies the column constraint'
);

-- Public-profile visibility. The mandatory identity is always shown; the rest is the member's
-- call, and the read function is the only door because profile_details is owner-only.
update public.profile_details
   set department = 'পরীক্ষামূলক বিভাগ', session = '২০২৪-২৫'
 where user_id = '22000000-0000-4000-8000-000000000002';
update public.profiles set bio = 'পরীক্ষামূলক পরিচিতি' where id = '22000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$select public.get_my_profile_visibility()$$,
  $$select jsonb_build_object('bio', true, 'department', false, 'session', false, 'hall_name', false, 'residency_status', false, 'published_stories', true)$$,
  'The default visibility shows the bio and published work and hides the payout details'
);
select lives_ok(
  $$select public.set_my_profile_visibility('{"department": false, "session": true}'::jsonb)$$,
  'A member may publish their own department and session'
);
select results_eq(
  $$select public.get_my_profile_visibility()->>'session'$$,
  $$values ('true')$$,
  'The stored choice is read back'
);
select throws_ok(
  $$select public.set_my_profile_visibility('{"nickname": true}'::jsonb)$$,
  'P0001', null,
  'An unknown visibility field is refused rather than silently dropped'
);
select throws_ok(
  $$select public.set_my_profile_visibility('{"department": "yes"}'::jsonb)$$,
  'P0001', null,
  'A visibility value that is not a boolean is refused'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$select bio, department, session from public.get_public_profile('reader_2200000000004000')$$,
  $$values ('পরীক্ষামূলক পরিচিতি'::text, null::text, '২০২৪-২৫'::text)$$,
  'The public profile exposes only the fields the member published'
);
select is_empty(
  $$select 1 from public.get_public_profile('nosuchuser')$$,
  'An unknown username resolves to no public profile'
);
select ok(
  (select username is not null and display_name is not null from public.get_public_profile('reader_2200000000004000')),
  'Identity stays public no matter how the visibility is set'
);
reset role;

-- Spotlight submission. Any signed-in member may post; photos must be their own; the desk owns
-- hide / restore / remove and the author may remove their own.
insert into public.spotlight_media_assets (id, owner_id, original_key, mime_type, original_bytes) values
  ('93000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000003', 'spotlight/mod/two.webp', 'image/webp', 1000)
on conflict (id) do nothing;
insert into public.spotlight_media_assets (id, owner_id, original_key, mime_type, original_bytes)
  select ('93000000-0000-4000-8000-' || lpad(entry::text, 12, '0'))::uuid,
         '22000000-0000-4000-8000-000000000002',
         'spotlight/reporter/many-' || entry || '.webp', 'image/webp', 1000
    from generate_series(1, 11) as entry
on conflict (id) do nothing;

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.submit_spotlight_post('অতিথির পোস্ট', 'প্রবেশ ছাড়া পোস্ট করার চেষ্টা')$$,
  '42501', null,
  'A signed-out visitor cannot post to Spotlight'
);
select throws_ok(
  $$select count(*) from public.spotlight_media_assets$$,
  '42501', null,
  'Spotlight object keys are never readable by a signed-out reader'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.submit_spotlight_post('স্পটলাইট পরীক্ষামূলক পোস্ট', 'এই পোস্টটি স্বয়ংক্রিয় পরীক্ষার জন্য তৈরি।', array['93000000-0000-4000-8000-000000000011'])$$,
  'Any signed-in member can raise an issue in Spotlight'
);
select results_eq(
  $$select count(*) from public.spotlight_post_media pm join public.spotlight_posts p on p.id = pm.post_id where p.title = 'স্পটলাইট পরীক্ষামূলক পোস্ট'$$,
  $$values (1::bigint)$$,
  'The submitted photos are attached to the post'
);
select throws_ok(
  $$select public.submit_spotlight_post('অন্যের ছবি ব্যবহার', 'অন্যের আপলোড পোস্টে যুক্ত করার চেষ্টা', array['93000000-0000-4000-8000-000000000002'])$$,
  'P0001', null,
  'A member cannot attach another member upload to their post'
);
select throws_ok(
  $$select public.submit_spotlight_post('অতিরিক্ত ছবি', 'দশটির বেশি ছবি যুক্ত করার চেষ্টা', array['93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000004','93000000-0000-4000-8000-000000000005','93000000-0000-4000-8000-000000000006','93000000-0000-4000-8000-000000000007','93000000-0000-4000-8000-000000000008','93000000-0000-4000-8000-000000000009','93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000011'])$$,
  'P0001', null,
  'A post may carry at most ten photos'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select public.admin_set_spotlight_status((select id from public.spotlight_posts where title = 'স্পটলাইট পরীক্ষামূলক পোস্ট'), 'hide', 'সম্পাদকীয় নীতিমালা লঙ্ঘন')$$,
  'The desk can hide a Spotlight post'
);
reset role;
select results_eq(
  $$select status from public.spotlight_posts where title = 'স্পটলাইট পরীক্ষামূলক পোস্ট'$$,
  $$values ('hidden')$$,
  'The hidden post keeps its row so it can be restored'
);

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select is_empty(
  $$select 1 from public.spotlight_posts where title = 'স্পটলাইট পরীক্ষামূলক পোস্ট'$$,
  'A hidden post is gone from the public feed'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$select status from public.spotlight_posts where title = 'স্পটলাইট পরীক্ষামূলক পোস্ট'$$,
  $$values ('hidden')$$,
  'The author can still read their own hidden post'
);
select throws_ok(
  $$select public.admin_set_spotlight_status((select id from public.spotlight_posts where title = 'স্পটলাইট পরীক্ষামূলক পোস্ট'), 'restore', 'নিজেই পুনরুদ্ধারের চেষ্টা')$$,
  '42501', null,
  'A member cannot reverse a desk decision'
);
select lives_ok(
  $$select public.submit_spotlight_post('মুছে ফেলার পোস্ট', 'লেখক নিজেই মুছে ফেলবেন এই পোস্টটি।')$$,
  'A member can post without photos'
);
reset role;

-- A moderator owns the second post, so the reporter below is a genuinely different member.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '33000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.submit_spotlight_post('মডারেটরের পোস্ট', 'অন্য একজন সদস্যের পোস্ট, মুছে ফেলা যাবে না।')$$,
  'A second member can post too'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.delete_my_spotlight_post((select id from public.spotlight_posts where title = 'মডারেটরের পোস্ট'))$$,
  '42501', null,
  'A member cannot delete another member''s post'
);
select lives_ok(
  $$select public.delete_my_spotlight_post((select id from public.spotlight_posts where title = 'মুছে ফেলার পোস্ট'))$$,
  'An author can delete their own post'
);
reset role;
select is_empty(
  $$select 1 from public.spotlight_posts where title = 'মুছে ফেলার পোস্ট'$$,
  'The deleted post is gone'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select public.admin_set_spotlight_status((select id from public.spotlight_posts where title = 'স্পটলাইট পরীক্ষামূলক পোস্ট'), 'restore', 'পুনর্বিবেচনায় পুনরুদ্ধার')$$,
  'The desk can restore a hidden post'
);
select lives_ok(
  $$select public.admin_set_spotlight_status((select id from public.spotlight_posts where title = 'স্পটলাইট পরীক্ষামূলক পোস্ট'), 'remove', 'পুনরায় নীতিমালা লঙ্ঘনে মুছে ফেলা')$$,
  'The desk can remove a post outright'
);
reset role;
select is_empty(
  $$select 1 from public.spotlight_posts where title = 'স্পটলাইট পরীক্ষামূলক পোস্ট'$$,
  'A post removed by the desk is gone'
);
select ok(
  (select count(*) from public.moderation_actions where action = 'moderate_spotlight') >= 2,
  'Every Spotlight desk decision is recorded in the moderation log'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);

select * from finish();
rollback;
