begin;
select plan(62);

-- The publish-time award is a deferred constraint trigger in production, so every publish path
-- sees the story's final gallery and questionnaire rows. This file asserts the award rows as it
-- goes, so the trigger fires at statement end here; the fixtures attach galleries and responses
-- before a story ever crosses into `published`.
set constraints public.award_article_earning_on_publish immediate;

-- Five accounts: A (junior, profile incomplete), B (general, incomplete until the release test),
-- C (general, complete from the start), M (moderator), X (administrator).
insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
values
  ('91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'earn-junior@du.ac.bd', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"সূত্র জুনিয়র"}', false, false),
  ('92000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'earn-general@du.ac.bd', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"সূত্র জেনারেল"}', false, false),
  ('93000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'earn-complete@du.ac.bd', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"সূত্র সম্পূর্ণ"}', false, false),
  ('94000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'earn-mod@du.ac.bd', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"সূত্র মডারেটর"}', false, false),
  ('95000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'earn-admin@du.ac.bd', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"সূত্র নির্বাহী"}', false, false)
on conflict (id) do nothing;

update public.user_roles set role = 'reporter', reporter_tier = 'junior' where user_id = '91000000-0000-4000-8000-000000000001';
update public.user_roles set role = 'reporter', reporter_tier = 'general' where user_id = '92000000-0000-4000-8000-000000000002';
update public.user_roles set role = 'reporter', reporter_tier = 'general' where user_id = '93000000-0000-4000-8000-000000000003';
update public.user_roles set role = 'moderator' where user_id = '94000000-0000-4000-8000-000000000004';
update public.user_roles set role = 'admin' where user_id = '95000000-0000-4000-8000-000000000005';

-- C signs in complete: every payable field is filled before anything earns.
update public.profile_details set
  department = 'পরীক্ষামূলক বিভাগ', session = '২০২০-২১', du_registration_number = '২০২০-৪৪৪৪৪',
  residency_status = 'off_campus', whatsapp_na = true, payout_method = 'bkash', payout_number = '01700000000'
  where user_id = '93000000-0000-4000-8000-000000000003';

-- ---------------------------------------------------------------------------
-- Word counting: Markdown is stripped, whitespace tokens count as one word, and a Bengali run
-- counts one word per six characters.
-- ---------------------------------------------------------------------------
select results_eq($$select public.article_word_count('')$$, $$values (0)$$, 'An empty body counts no words');
select results_eq($$select public.article_word_count(repeat('word ', 150))$$, $$values (150)$$, 'A Latin run counts one word per token');
select results_eq($$select public.article_word_count(repeat('ক', 6))$$, $$values (1)$$, 'Six Bengali characters make one word');
select results_eq($$select public.article_word_count(repeat('ক', 7))$$, $$values (2)$$, 'The seventh Bengali character opens the next word');
select results_eq($$select public.article_word_count(repeat('ক', 6) || ' abc')$$, $$values (2)$$, 'A Latin token beside a Bengali run counts on its own');
select results_eq($$select public.article_word_count('**bold** *italic* `code` [link](https://dutimz.com)')$$, $$values (4)$$, 'Markdown furniture is stripped before words are counted');

-- ---------------------------------------------------------------------------
-- The formula components, measured through `compute_article_earning` on draft fixtures that
-- never publish (so no award fires). Every story carries a 150-word body unless a word tier
-- is what is under test; only the named component varies.
-- ---------------------------------------------------------------------------
insert into public.media_assets (id, owner_id, original_key, mime_type, original_bytes)
  select ('c1000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, '92000000-0000-4000-8000-000000000002',
         'earn-test-' || g, 'image/jpeg', 1000 + g
    from generate_series(1, 11) g;

insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-campus-150', 'ভিত্তি ফি পরীক্ষা',
         'ভিত্তি ফি পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-crime', 'অপরাধ বোনাস পরীক্ষা',
         'অপরাধ বোনাস পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft'
    from public.categories c where c.slug = 'crime';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-151', 'প্রথম শব্দ সীমা পরীক্ষা',
         'প্রথম শব্দ সীমা পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 151), 'draft'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-251', 'দ্বিতীয় শব্দ সীমা পরীক্ষা',
         'দ্বিতীয় শব্দ সীমা পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 251), 'draft'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, hero_media_key)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-hero', 'প্রচ্ছদ বোনাস পরীক্ষা',
         'প্রচ্ছদ বোনাস পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft', 'c1000000-0000-4000-8000-000000000001'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-g5', 'পাঁচ ছবির গ্যালারি পরীক্ষা',
         'পাঁচ ছবির গ্যালারি পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-g6', 'ছয় ছবির গ্যালারি পরীক্ষা',
         'ছয় ছবির গ্যালারি পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-g10', 'দশ ছবির গ্যালারি পরীক্ষা',
         'দশ ছবির গ্যালারি পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-g11', 'এগারো ছবির গ্যালারি পরীক্ষা',
         'এগারো ছবির গ্যালারি পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, hero_media_key)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-hero-g6', 'প্রচ্ছদসহ গ্যালারি পরীক্ষা',
         'প্রচ্ছদসহ গ্যালারি পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft', 'c1000000-0000-4000-8000-000000000001'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, interview_kind)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-iv', 'ভার্চুয়াল সাক্ষাৎকার পরীক্ষা',
         'ভার্চুয়াল সাক্ষাৎকার পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft', 'virtual'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, interview_kind)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-ip', 'সশরীর সাক্ষাৎকার পরীক্ষা',
         'সশরীর সাক্ষাৎকার পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft', 'in-person'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-q-full', 'পূর্ণ প্রশ্নমালা পরীক্ষা',
         'পূর্ণ প্রশ্নমালা পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-q-partial', 'আংশিক প্রশ্নমালা পরীক্ষা',
         'আংশিক প্রশ্নমালা পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-q-hidden', 'লুকানো শাখার প্রশ্নমালা পরীক্ষা',
         'লুকানো শাখার প্রশ্নমালা পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft'
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-q-none', 'উত্তরহীন প্রশ্নমালা পরীক্ষা',
         'উত্তরহীন প্রশ্নমালা পরীক্ষার সংক্ষিপ্ত পরিচিতি', repeat('word ', 150), 'draft'
    from public.categories c where c.slug = 'campus';

-- Gallery attachments. The hero story earns +2 for its cover; the six-gallery one attaches its
-- hero as a member of the gallery too, so the formula must not count it twice.
insert into public.article_media (article_id, media_id, position, is_gallery, is_inline)
  select (select id from public.articles where slug = 'earn-g5'), id, ordinality - 1, true, false
    from public.media_assets, unnest(array[1,2,3,4,5]) with ordinality as g(n, ordinality)
   where original_key = 'earn-test-' || g.n;
insert into public.article_media (article_id, media_id, position, is_gallery, is_inline)
  select (select id from public.articles where slug = 'earn-g6'), id, ordinality - 1, true, false
    from public.media_assets, unnest(array[1,2,3,4,5,6]) with ordinality as g(n, ordinality)
   where original_key = 'earn-test-' || g.n;
insert into public.article_media (article_id, media_id, position, is_gallery, is_inline)
  select (select id from public.articles where slug = 'earn-g10'), id, ordinality - 1, true, false
    from public.media_assets, unnest(array[1,2,3,4,5,6,7,8,9,10]) with ordinality as g(n, ordinality)
   where original_key = 'earn-test-' || g.n;
insert into public.article_media (article_id, media_id, position, is_gallery, is_inline)
  select (select id from public.articles where slug = 'earn-g11'), id, ordinality - 1, true, false
    from public.media_assets, unnest(array[1,2,3,4,5,6,7,8,9,10,11]) with ordinality as g(n, ordinality)
   where original_key = 'earn-test-' || g.n;
insert into public.article_media (article_id, media_id, position, is_gallery, is_inline)
  select (select id from public.articles where slug = 'earn-hero-g6'), id, ordinality - 1, true, false
    from public.media_assets, unnest(array[1,2,3,4,5,6]) with ordinality as g(n, ordinality)
   where original_key = 'earn-test-' || g.n;

-- Questionnaire responses. Completeness walks only the fields the version shows for the given
-- answers: a hidden branch's fields are neither demanded nor counted.
insert into public.article_questionnaire_responses (article_id, questionnaire_version_id, answers)
  select (select id from public.articles where slug = 'earn-q-full'),
         (select id from public.article_questionnaire_versions where active),
         '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে","criminal_activity":"না","activity_type":"অন্যান্য","activity_details":"পরীক্ষা"}'::jsonb;
insert into public.article_questionnaire_responses (article_id, questionnaire_version_id, answers)
  select (select id from public.articles where slug = 'earn-q-partial'),
         (select id from public.article_questionnaire_versions where active),
         '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে"}'::jsonb;
insert into public.article_questionnaire_responses (article_id, questionnaire_version_id, answers)
  select (select id from public.articles where slug = 'earn-q-hidden'),
         (select id from public.article_questionnaire_versions where active),
         '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে","criminal_activity":"হ্যাঁ","crime_type":["অন্যান্য অপরাধ"],"crime_details":"পরীক্ষামূলক বিবরণ","crime_location":"ঢাকা","crime_time":"গতকাল","suspects":{"count":1,"people":[{"name":"অজ্ঞাত"}]}}'::jsonb;

select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-campus-150'))).amount_tk$$, $$values (25::numeric)$$, 'The base fee is ৳25 for a plain campus story');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-crime'))).amount_tk$$, $$values (35::numeric)$$, 'A crime story adds ৳10');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-151'))).amount_tk$$, $$values (35::numeric)$$, 'The first word past 150 earns the first length bonus');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-251'))).amount_tk$$, $$values (45::numeric)$$, 'The second hundred words earns the second length bonus');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-hero'))).amount_tk$$, $$values (27::numeric)$$, 'A thumbnail adds ৳2');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-g5'))).amount_tk$$, $$values (35::numeric)$$, 'The first five gallery images add ৳2 each');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-g6'))).amount_tk$$, $$values (36::numeric)$$, 'The sixth gallery image adds ৳1');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-g10'))).amount_tk$$, $$values (40::numeric)$$, 'Images six through ten add ৳1 each');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-g11'))).amount_tk$$, $$values (40.50)$$, 'The eleventh gallery image adds ৳0.50');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-hero-g6'))).amount_tk$$, $$values (37::numeric)$$, 'A hero attached to the gallery earns its ৳2 once and is not counted again');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-iv'))).amount_tk$$, $$values (35::numeric)$$, 'A virtual interview adds ৳10');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-ip'))).amount_tk$$, $$values (45::numeric)$$, 'An in-person interview adds ৳20');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-q-full'))).amount_tk$$, $$values (26::numeric)$$, 'A fully answered questionnaire adds ৳1');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-q-partial'))).amount_tk$$, $$values (25::numeric)$$, 'A questionnaire with a visible question unanswered earns nothing');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-q-hidden'))).amount_tk$$, $$values (26::numeric)$$, 'Fields on a hidden branch are not demanded for completeness');
select results_eq($$select (public.compute_article_earning((select id from public.articles where slug = 'earn-q-none'))).amount_tk$$, $$values (25::numeric)$$, 'A story with no questionnaire response earns no questionnaire bonus');
select ok(
  (select c.amount_tk = (c.details->>'total')::numeric
     from public.compute_article_earning((select id from public.articles where slug = 'earn-hero-g6')) c),
  'The formula records its own total inside the details'
);

-- ---------------------------------------------------------------------------
-- The publish boundary: a junior submission earns only on approval, once, and survives
-- withhold-and-restore without a second credit.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.submit_article('campus', 'জুনিয়র প্রতিবেদকের জমা', 'জুনিয়র প্রতিবেদকের সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), null, null, null, '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে","criminal_activity":"না","activity_type":"অন্যান্য","activity_details":"পরীক্ষা"}'::jsonb, (select id from public.article_questionnaire_versions where active))$$,
  'A junior reporter files a story for the desk'
);
select results_eq(
  $$select count(*)::int from public.earnings_ledger where article_id = (select id from public.articles where title = 'জুনিয়র প্রতিবেদকের জমা')$$,
  $$values (0)$$,
  'A story earns nothing while it waits for the desk'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '94000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$select public.moderate_article((select id from public.articles where title = 'জুনিয়র প্রতিবেদকের জমা'), 'approve')$$,
  'A moderator approves the junior story'
);
reset role;
select ok(
  (select amount_tk = (select (public.compute_article_earning((select id from public.articles where title = 'জুনিয়র প্রতিবেদকের জমা'))).amount_tk)
     from public.earnings_ledger where article_id = (select id from public.articles where title = 'জুনিয়র প্রতিবেদকের জমা')),
  'Approval credits the formula amount over the submitted story'
);
select results_eq(
  $$select count(*)::int, min(entry_type::text), bool_and((details->>'total')::numeric = amount_tk) from public.earnings_ledger where article_id = (select id from public.articles where title = 'জুনিয়র প্রতিবেদকের জমা')$$,
  $$values (1, 'article_earning_held', true)$$,
  'The incomplete junior profile holds the fee and the details carry the total'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000005', true);
select lives_ok(
  $$select public.admin_set_article_status((select id from public.articles where title = 'জুনিয়র প্রতিবেদকের জমা'), 'rejected')$$,
  'The desk can withhold the paid story'
);
select lives_ok(
  $$select public.admin_set_article_status((select id from public.articles where title = 'জুনিয়র প্রতিবেদকের জমা'), 'published')$$,
  'And can restore it'
);
reset role;
select results_eq(
  $$select count(*)::int from public.earnings_ledger where article_id = (select id from public.articles where title = 'জুনিয়র প্রতিবেদকের জমা') and entry_type in ('article_earning_available', 'article_earning_held')$$,
  $$values (1)$$,
  'Withholding and restoring a story never credits it twice'
);

-- ---------------------------------------------------------------------------
-- Authorship: the attribution resolves the owner of an anonymous story, and an ownerless one
-- earns nobody anything.
-- ---------------------------------------------------------------------------
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, is_anonymous)
  select null, c.id, 'earn-anon-attr', 'নামহীন ফর্মুলা পরীক্ষা',
         'নামহীন প্রতিবেদনের সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), 'draft', true
    from public.categories c where c.slug = 'campus';
insert into public.article_attributions (article_id, author_id)
  values ((select id from public.articles where slug = 'earn-anon-attr'), '91000000-0000-4000-8000-000000000001');
update public.articles set status = 'published', published_at = now() where slug = 'earn-anon-attr';
select results_eq(
  $$select count(*)::int, min(user_id::text) from public.earnings_ledger where article_id = (select id from public.articles where slug = 'earn-anon-attr')$$,
  $$values (1, '91000000-0000-4000-8000-000000000001')$$,
  'Publishing an anonymous story credits the attributed author'
);
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, published_at, is_anonymous)
  select null, c.id, 'earn-ownerless', 'মালিকহীন ফর্মুলা পরীক্ষা',
         'মালিকহীন প্রতিবেদনের সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), 'published', now(), true
    from public.categories c where c.slug = 'campus';
select results_eq(
  $$select count(*)::int from public.earnings_ledger where article_id = (select id from public.articles where slug = 'earn-ownerless')$$,
  $$values (0)$$,
  'An ownerless anonymous story earns nothing'
);

-- ---------------------------------------------------------------------------
-- Views: distinct per reader per day, the author's own visit never counts, drafts and empty
-- tokens are ignored, and the day caps at 1,000 (tested later).
-- ---------------------------------------------------------------------------
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, published_at)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-view', 'ভিউ আয়ের প্রতিবেদন',
         'ভিউ আয়ের সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), 'published', now()
    from public.categories c where c.slug = 'campus';
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-draft-view', 'খসড়া প্রতিবেদন দেখার চেষ্টা',
         'খসড়া প্রতিবেদনের সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), 'draft'
    from public.categories c where c.slug = 'campus';
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select lives_ok(
  $$select public.record_article_view((select id from public.articles where slug = 'earn-view'), '1.1.1.1', 'viewer-' || g) from generate_series(1, 25) g$$,
  'Twenty-five distinct readers can each view a published story'
);
select results_eq(
  $$select count(*)::int from public.article_views where article_id = (select id from public.articles where slug = 'earn-view')$$,
  $$values (25)$$,
  'Every distinct reader counts once'
);
select lives_ok(
  $$select public.record_article_view((select id from public.articles where slug = 'earn-view'), '1.1.1.1', 'viewer-7')$$,
  'The same reader can revisit their story'
);
select results_eq(
  $$select count(*)::int from public.article_views where article_id = (select id from public.articles where slug = 'earn-view')$$,
  $$values (25)$$,
  'And their second visit of the day adds nothing'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.record_article_view((select id from public.articles where slug = 'earn-view'), '1.1.1.1', 'author-reads-own')$$,
  'The author can open their own published story'
);
select results_eq(
  $$select count(*)::int from public.article_views where article_id = (select id from public.articles where slug = 'earn-view')$$,
  $$values (25)$$,
  'And their own visit never counts'
);
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select lives_ok(
  $$select public.record_article_view((select id from public.articles where slug = 'earn-view'), '1.1.1.1', '')$$,
  'A view without a device token is ignored'
);
select lives_ok(
  $$select public.record_article_view((select id from public.articles where slug = 'earn-draft-view'), '1.1.1.1', 'reads-a-draft')$$,
  'A view on an unpublished draft is ignored'
);
select results_eq(
  $$select count(*)::int from public.article_views where article_id = (select id from public.articles where slug = 'earn-draft-view')$$,
  $$values (0)$$,
  'Nothing is recorded for the draft'
);

-- ---------------------------------------------------------------------------
-- Settlement: batches of ten at ৳0.02 per view, the remainder carries forward, and a run with
-- nothing new credits nothing.
-- ---------------------------------------------------------------------------
reset role;
select results_eq(
  $$select public.settle_article_view_earnings()$$,
  $$values (1)$$,
  'Settling credits the complete ten-view batches'
);
select results_eq(
  $$select entry_type::text, amount_tk, (details->>'views')::int, (details->>'rate_per_view')::numeric, view_day = timezone('Asia/Dhaka', now())::date
     from public.earnings_ledger where article_id = (select id from public.articles where slug = 'earn-view') and entry_type like 'view_earning_%'$$,
  $$values ('view_earning_held', 0.40, 20, 0.02, true)$$,
  'The batch is credited as held view income stamped with its day'
);
select results_eq(
  $$select count(*)::int from public.article_views where article_id = (select id from public.articles where slug = 'earn-view') and not settled$$,
  $$values (5)$$,
  'The five-view remainder waits for the next run'
);
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select lives_ok(
  $$select public.record_article_view((select id from public.articles where slug = 'earn-view'), '1.1.1.2', 'viewer-' || g) from generate_series(26, 30) g$$,
  'Five more readers arrive'
);
reset role;
select results_eq(
  $$select public.settle_article_view_earnings()$$,
  $$values (1)$$,
  'Their visit completes the carried remainder into one batch'
);
select results_eq(
  $$select count(*)::int, sum(amount_tk) from public.earnings_ledger where article_id = (select id from public.articles where slug = 'earn-view') and entry_type like 'view_earning_%'$$,
  $$values (2, 0.60)$$,
  'The story holds two batches totalling ৳0.60'
);
select results_eq(
  $$select public.settle_article_view_earnings()$$,
  $$values (0)$$,
  'A run with nothing new credits nothing'
);

-- ---------------------------------------------------------------------------
-- The profile release: completing B's profile frees the held fee and both held view batches,
-- each release naming the row it settles.
-- ---------------------------------------------------------------------------
update public.profile_details set
  department = 'পরীক্ষামূলক বিভাগ', session = '২০২০-২১', du_registration_number = '২০২০-৫৫৫৫৫',
  residency_status = 'off_campus', whatsapp_na = true, payout_method = 'bkash', payout_number = '01711111111'
  where user_id = '92000000-0000-4000-8000-000000000002';
select results_eq(
  $$select public.profile_completion_for('92000000-0000-4000-8000-000000000002')$$,
  $$values (100)$$,
  'The reporter’s profile completes'
);
select results_eq(
  $$select count(*)::int, sum(amount_tk) from public.earnings_ledger
     where user_id = '92000000-0000-4000-8000-000000000002' and entry_type = 'profile_release'
       and article_id = (select id from public.articles where slug = 'earn-view')$$,
  $$values (3, 25.60)$$,
  'Completing the profile releases the held fee and both view batches'
);
select results_eq(
  $$select bool_and(released_from is not null), bool_and(view_day is null) from public.earnings_ledger
     where user_id = '92000000-0000-4000-8000-000000000002' and entry_type = 'profile_release'
       and article_id = (select id from public.articles where slug = 'earn-view')$$,
  $$values (true, true)$$,
  'Every release names the held row it settles and carries no day stamp'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$select (public.get_my_wallet() ->> 'held')::numeric, (public.get_my_wallet() ->> 'available')::numeric$$,
  $$values (0::numeric, 25.60)$$,
  'The wallet shows the released money as available and nothing held'
);
reset role;

-- ---------------------------------------------------------------------------
-- The daily view cap: the thousand-and-first reader is served but not counted.
-- ---------------------------------------------------------------------------
insert into public.articles (author_id, category_id, slug, title, excerpt, body, status, published_at)
  select '92000000-0000-4000-8000-000000000002', c.id, 'earn-cap', 'দৈনিক সীমার প্রতিবেদন',
         'দৈনিক সীমার সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), 'published', now()
    from public.categories c where c.slug = 'campus';
insert into public.article_views (article_id, viewer_hash)
  select (select id from public.articles where slug = 'earn-cap'), md5('cap:' || g)
    from generate_series(1, 1000) g;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select lives_ok(
  $$select public.record_article_view((select id from public.articles where slug = 'earn-cap'), '2.2.2.2', 'the-thousand-first')$$,
  'A story can still take the thousand-and-first reader'
);
select results_eq(
  $$select count(*)::int from public.article_views where article_id = (select id from public.articles where slug = 'earn-cap')$$,
  $$values (1000)$$,
  'And the daily cap stops counting after 1,000'
);
reset role;

-- ---------------------------------------------------------------------------
-- Who may do what: only the cron's service role settles, nobody reads the view log, and the
-- enum knows both view types.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '95000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select public.settle_article_view_earnings()$$,
  '42501', null,
  'Even a signed-in administrator cannot settle by hand'
);
reset role;
select ok(
  has_function_privilege('anon', 'public.record_article_view(uuid, text, text)', 'execute'),
  'A signed-out visitor can record a view'
);
select ok(
  not has_function_privilege('authenticated', 'public.settle_article_view_earnings()', 'execute'),
  'No signed-in role can settle view earnings'
);
select results_eq(
  $$select count(*)::int from unnest(enum_range(null::public.ledger_entry_type)) as e where e::text in ('view_earning_available', 'view_earning_held')$$,
  $$values (2)$$,
  'The ledger enum carries both view income types'
);
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select count(*) from public.article_views$$,
  '42501', null,
  'The view log is readable by nobody'
);
reset role;

-- ---------------------------------------------------------------------------
-- The gallery cap: twenty images file, a twenty-first is refused.
-- ---------------------------------------------------------------------------
insert into public.media_assets (id, owner_id, original_key, mime_type, original_bytes)
  select ('c2000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, '91000000-0000-4000-8000-000000000001',
         'earn-junior-' || g, 'image/jpeg', 1000 + g
    from generate_series(1, 20) g;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.submit_article('campus', 'একুশ ছবির জমা', 'একুশ ছবির সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), null, null,
      array(select ('c3000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::text from generate_series(1, 21) g),
      '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে","criminal_activity":"না","activity_type":"অন্যান্য","activity_details":"পরীক্ষা"}'::jsonb,
      (select id from public.article_questionnaire_versions where active))$$,
  'P0001', null,
  'A twenty-first gallery image is refused'
);
select lives_ok(
  $$select public.submit_article('campus', 'বিশ ছবির জমা', 'বিশ ছবির সংক্ষিপ্ত পরিচিতি', repeat('প্রতিবেদনের অংশ। ', 8), null, null,
      array(select id::text from public.media_assets where original_key like 'earn-junior-%' order by original_key),
      '{"verification_status":"একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","verification_notes":"দুটি স্বাধীন সূত্রে তথ্য যাচাই করা হয়েছে","criminal_activity":"না","activity_type":"অন্যান্য","activity_details":"পরীক্ষা"}'::jsonb,
      (select id from public.article_questionnaire_versions where active))$$,
  'Twenty gallery images file successfully'
);

select * from finish();
rollback;
