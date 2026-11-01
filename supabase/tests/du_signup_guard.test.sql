begin;
select plan(5);

-- The guard fires on the insert itself, before any profile row exists, so a rejected
-- address leaves nothing behind: no account, no profile, no role.
select throws_ok(
  $$insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
    values ('aa000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'outsider@gmail.com', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"বাইরের পাঠক"}', false, false)$$,
  'P0001', null,
  'A Gmail address never becomes an account'
);
select throws_ok(
  $$insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
    values ('ab000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'student@notdu.ac.bd', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"ভুয়া শিক্ষার্থী"}', false, false)$$,
  'P0001', null,
  'A domain that only ends in the letters du.ac.bd (notdu.ac.bd) is not the university'
);
select lives_ok(
  $$insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
    values ('ac000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'student@du.ac.bd', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"প্রকৃত শিক্ষার্থী"}', false, false)$$,
  'A plain du.ac.bd address is accepted'
);
select lives_ok(
  $$insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
    values ('ad000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'student@mgt.du.ac.bd', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"ব্যবস্থাপনার শিক্ষার্থী"}', false, false)$$,
  'A departmental subdomain (mgt.du.ac.bd) is accepted'
);
select lives_ok(
  $$insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
    values ('ae000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'STUDENT@MKT.du.ac.bd', now(), now(), now(), '{"provider":"google","providers":["google"]}', '{"full_name":"বিপণনের শিক্ষার্থী"}', false, false)$$,
  'Another subdomain is accepted even in mixed case (mkt.du.ac.bd)'
);

select finish();
rollback;
