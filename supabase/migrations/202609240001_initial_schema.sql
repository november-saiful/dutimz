-- DUTIMZ initial schema. All production schema changes must be added as ordered
-- migrations; do not modify production tables in the Supabase dashboard.
begin;

create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('reader', 'reporter', 'moderator', 'admin');
create type public.reporter_tier as enum ('junior', 'general', 'executive');
create type public.article_status as enum ('draft', 'pending', 'published', 'rejected');
create type public.comment_status as enum ('visible', 'hidden', 'removed');
create type public.withdrawal_status as enum ('pending', 'paid', 'rejected');
create type public.ledger_entry_type as enum (
  'article_earning_available',
  'article_earning_held',
  'profile_release',
  'withdrawal_reserve',
  'withdrawal_refund',
  'manual_adjustment'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z][a-zA-Z0-9_]{2,23}$'),
  display_name text not null default '' check (char_length(display_name) <= 80),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  bio text not null default '' check (char_length(bio) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_display_name_idx on public.profiles using gin (to_tsvector('simple', display_name));

-- All student registration, contact, residence, and payout fields are isolated
-- from the publicly-readable profiles table.
create table public.profile_details (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  department text check (department is null or char_length(department) <= 100),
  session text check (session is null or char_length(session) <= 24),
  hall_name text check (hall_name is null or char_length(hall_name) <= 120),
  residency_status text check (residency_status is null or residency_status in ('hall_resident', 'off_campus')),
  du_registration_number text check (du_registration_number is null or char_length(du_registration_number) <= 40),
  whatsapp_number text check (whatsapp_number is null or char_length(whatsapp_number) <= 24),
  whatsapp_na boolean not null default false,
  payout_method text check (payout_method is null or payout_method in ('bkash', 'nagad')),
  payout_number text check (payout_number is null or char_length(payout_number) <= 24),
  completion_percent integer not null default 0 check (completion_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_hall_status check (
    residency_status <> 'hall_resident' or nullif(trim(hall_name), '') is not null
  ),
  constraint valid_payout_pair check (
    (payout_method is null and payout_number is null)
    or (payout_method is not null and nullif(trim(payout_number), '') is not null)
  )
);

create table public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.app_role not null default 'reader',
  reporter_tier public.reporter_tier,
  assigned_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint reporter_requires_tier check (role <> 'reporter' or reporter_tier is not null),
  constraint reader_cannot_have_tier check (role <> 'reader' or reporter_tier is null)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_bn text not null,
  description_bn text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true
);
insert into public.categories (slug, title_bn, description_bn, sort_order) values
  ('campus', 'ক্যাম্পাস', 'ক্যাম্পাসের সংবাদ ও শিক্ষার্থীদের উদ্যোগ', 1),
  ('university', 'বিশ্ববিদ্যালয়', 'ঢাকা বিশ্ববিদ্যালয়ের শিক্ষা, গবেষণা ও প্রশাসন', 2),
  ('student-life', 'শিক্ষার্থী জীবন', 'হল, ক্লাব, পাঠচক্র ও ক্যাম্পাস জীবন', 3),
  ('culture', 'সংস্কৃতি', 'শিল্প, সাহিত্য, সংস্কৃতি ও আয়োজন', 4),
  ('opinion', 'মতামত', 'শিক্ষার্থী ও লেখকদের মতামত', 5),
  ('sports', 'ক্রীড়া', 'ক্যাম্পাসের খেলাধুলা ও ক্রীড়া সংবাদ', 6);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(trim(title)) between 5 and 180),
  excerpt text not null check (char_length(trim(excerpt)) between 10 and 280),
  body text not null check (char_length(trim(body)) >= 100),
  hero_media_key text check (hero_media_key is null or char_length(hero_media_key) <= 512),
  status public.article_status not null default 'pending',
  featured boolean not null default false,
  published_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  search_document tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(body, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_published_timestamp check ((status <> 'published') or published_at is not null)
);
create index articles_published_recent_idx on public.articles (published_at desc) where status = 'published';
create index articles_author_idx on public.articles (author_id, created_at desc);
create index articles_pending_idx on public.articles (created_at asc) where status = 'pending';
create index articles_search_idx on public.articles using gin (search_document);
create index articles_category_idx on public.articles (category_id, published_at desc) where status = 'published';

create table public.article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  editor_id uuid not null references public.profiles(id) on delete restrict,
  version integer not null check (version > 0),
  title text not null,
  excerpt text not null,
  body text not null,
  reason text not null default 'প্রাথমিক খসড়া' check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (article_id, version)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  status public.comment_status not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_article_recent_idx on public.comments (article_id, created_at desc) where status = 'visible';

create table public.reactions (
  article_id uuid not null references public.articles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null default 'like' check (reaction in ('like', 'insightful', 'support')),
  created_at timestamptz not null default now(),
  primary key (article_id, user_id, reaction)
);

create table public.bookmarks (
  article_id uuid not null references public.articles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (article_id, user_id)
);

create table public.reporter_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  motivation text not null check (char_length(trim(motivation)) between 20 and 1500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index one_pending_reporter_application_per_user
  on public.reporter_applications (applicant_id) where status = 'pending';

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount_tk integer not null check (amount_tk >= 3000),
  method text not null check (method in ('bkash', 'nagad')),
  payout_number_snapshot text not null check (char_length(payout_number_snapshot) between 8 and 24),
  status public.withdrawal_status not null default 'pending',
  review_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint withdrawal_review_data check (
    (status = 'pending' and reviewed_at is null)
    or (status <> 'pending' and reviewed_at is not null and nullif(trim(review_reason), '') is not null)
  )
);
create index withdrawals_user_recent_idx on public.withdrawals (user_id, created_at desc);
create index withdrawals_pending_idx on public.withdrawals (created_at asc) where status = 'pending';

create table public.earnings_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  article_id uuid references public.articles(id) on delete restrict,
  withdrawal_id uuid references public.withdrawals(id) on delete restrict,
  entry_type public.ledger_entry_type not null,
  amount_tk integer not null check (amount_tk <> 0),
  reporter_tier_snapshot public.reporter_tier,
  reason text check (reason is null or char_length(reason) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ledger_article_reference check (
    (entry_type in ('article_earning_available', 'article_earning_held') and article_id is not null and withdrawal_id is null and amount_tk > 0)
    or (entry_type not in ('article_earning_available', 'article_earning_held') and article_id is null)
  ),
  constraint ledger_withdrawal_reference check (
    (entry_type in ('withdrawal_reserve', 'withdrawal_refund') and withdrawal_id is not null)
    or (entry_type not in ('withdrawal_reserve', 'withdrawal_refund') and withdrawal_id is null)
  ),
  constraint ledger_withdrawal_sign check (
    (entry_type = 'withdrawal_reserve' and amount_tk < 0)
    or (entry_type <> 'withdrawal_reserve')
  )
);
create unique index one_article_fee_per_article on public.earnings_ledger (article_id)
  where entry_type in ('article_earning_available', 'article_earning_held');
create unique index one_withdrawal_reserve_per_request on public.earnings_ledger (withdrawal_id)
  where entry_type = 'withdrawal_reserve';
create index earnings_user_recent_idx on public.earnings_ledger (user_id, created_at desc);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('approve_article', 'reject_article', 'hide_comment', 'remove_comment', 'restore_comment', 'assign_role', 'review_withdrawal', 'edit_article', 'adjust_balance')),
  article_id uuid references public.articles(id) on delete set null,
  comment_id uuid references public.comments(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  withdrawal_id uuid references public.withdrawals(id) on delete set null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint moderation_has_target check (
    article_id is not null or comment_id is not null or target_user_id is not null or withdrawal_id is not null
  )
);
create index moderation_actions_recent_idx on public.moderation_actions (created_at desc);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  target_id uuid,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('initial_admin_email', ''),
  ('initial_admin_claimed', 'false');

-- A signup always receives a reader role and an unguessable URL-safe username.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata_name text;
begin
  metadata_name := left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80);
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    'reader_' || replace(left(new.id::text, 18), '-', ''),
    metadata_name,
    left(new.raw_user_meta_data ->> 'avatar_url', 2048)
  ) on conflict (id) do nothing;
  insert into public.profile_details (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'reader') on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger profile_details_touch_updated_at before update on public.profile_details
  for each row execute function public.touch_updated_at();
create trigger articles_touch_updated_at before update on public.articles
  for each row execute function public.touch_updated_at();
create trigger comments_touch_updated_at before update on public.comments
  for each row execute function public.touch_updated_at();

create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select role from public.user_roles where user_id = (select auth.uid())
$$;

create or replace function public.is_moderator_or_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public.current_app_role()) in ('moderator', 'admin'), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public.current_app_role()) = 'admin', false)
$$;

create or replace function public.reporter_fee_for_tier(p_tier public.reporter_tier)
returns integer language sql immutable set search_path = '' as $$
  select case p_tier when 'junior' then 90 when 'general' then 115 when 'executive' then 140 else null end
$$;

create or replace function public.profile_completion_for(p_user_id uuid)
returns integer
language sql stable security definer
set search_path = ''
as $$
  with joined as (
    select
      p.display_name,
      d.department,
      d.session,
      d.du_registration_number,
      d.residency_status,
      d.hall_name,
      d.whatsapp_number,
      d.whatsapp_na,
      d.payout_method,
      d.payout_number
    from public.profiles p
    left join public.profile_details d on d.user_id = p.id
    where p.id = p_user_id
  ), progress as (
    select
      ((nullif(trim(display_name), '') is not null)::int
       + (nullif(trim(department), '') is not null)::int
       + (nullif(trim(session), '') is not null)::int
       + (nullif(trim(du_registration_number), '') is not null)::int
       + (residency_status is not null)::int
       + ((whatsapp_na or nullif(trim(whatsapp_number), '') is not null)::int)
       + ((payout_method is not null and nullif(trim(payout_number), '') is not null)::int)
       + ((residency_status = 'off_campus' or (residency_status = 'hall_resident' and nullif(trim(hall_name), '') is not null))::int)) as completed,
      8 as total
    from joined
  )
  select coalesce(round((completed::numeric / total) * 100)::integer, 0) from progress
$$;

create or replace function public.get_my_profile_completion()
returns integer language sql stable security definer set search_path = '' as $$
  select public.profile_completion_for((select auth.uid()))
$$;

create or replace function public.get_my_wallet()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'held', coalesce((select sum(amount_tk) from public.earnings_ledger l where l.user_id = (select auth.uid()) and l.entry_type = 'article_earning_held'), 0),
    'available', coalesce((select sum(amount_tk) from public.earnings_ledger l where l.user_id = (select auth.uid()) and l.entry_type in ('article_earning_available', 'profile_release', 'withdrawal_reserve', 'withdrawal_refund', 'manual_adjustment')), 0),
    'reserved', coalesce((select sum(w.amount_tk) from public.withdrawals w where w.user_id = (select auth.uid()) and w.status = 'pending'), 0)
  )
$$;

create or replace function public.get_article_stats(p_article_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'likes', (select count(*) from public.reactions r where r.article_id = p_article_id and r.reaction = 'like'),
    'comments', (select count(*) from public.comments c where c.article_id = p_article_id and c.status = 'visible')
  )
  where exists (select 1 from public.articles a where a.id = p_article_id and a.status = 'published')
$$;

create or replace function public.release_held_earnings()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  released_total integer;
begin
  if public.profile_completion_for(new.user_id) = 100 then
    update public.earnings_ledger
      set entry_type = 'profile_release', reason = 'প্রোফাইল ১০০% সম্পূর্ণ হওয়ায় আয় ছাড়'
      where user_id = new.user_id and entry_type = 'article_earning_held';
  end if;
  return new;
end;
$$;
create trigger release_held_earnings_on_profile_change
  after insert or update of department, session, hall_name, residency_status, du_registration_number, whatsapp_number, whatsapp_na, payout_method, payout_number
  on public.profile_details for each row execute function public.release_held_earnings();
-- Display name lives on the public-profile row; completing it can release held fees too.
create or replace function public.release_held_earnings_on_identity_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.profile_completion_for(new.id) = 100 then
    update public.earnings_ledger set entry_type = 'profile_release', reason = 'প্রোফাইল ১০০% সম্পূর্ণ হওয়ায় আয় ছাড়'
      where user_id = new.id and entry_type = 'article_earning_held';
  end if;
  return new;
end;
$$;
create trigger release_held_earnings_on_identity_change
  after update of display_name on public.profiles for each row
  execute function public.release_held_earnings_on_identity_change();

create or replace function public.add_article_earning(p_article_id uuid, p_author_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  author_tier public.reporter_tier;
  amount integer;
  entry public.ledger_entry_type;
begin
  select r.reporter_tier into author_tier from public.user_roles r where r.user_id = p_author_id;
  amount := public.reporter_fee_for_tier(author_tier);
  if amount is null then return; end if;
  entry := case when public.profile_completion_for(p_author_id) = 100 then 'article_earning_available' else 'article_earning_held' end;
  insert into public.earnings_ledger (user_id, article_id, entry_type, amount_tk, reporter_tier_snapshot)
    values (p_author_id, p_article_id, entry, amount, author_tier)
    on conflict (article_id) where entry_type in ('article_earning_available', 'article_earning_held') do nothing;
end;
$$;

create or replace function public.submit_article(
  p_category_slug text,
  p_slug text,
  p_title text,
  p_excerpt text,
  p_body text,
  p_hero_media_key text default null
)
returns public.articles
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_role public.app_role;
  actor_tier public.reporter_tier;
  category uuid;
  created public.articles;
begin
  if actor is null then raise exception 'يجب প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select role, reporter_tier into actor_role, actor_tier from public.user_roles where user_id = actor;
  if actor_role not in ('reporter', 'moderator', 'admin') then raise exception 'প্রতিবেদন জমা দিতে রিপোর্টার অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  select id into category from public.categories where slug = p_category_slug and active;
  if category is null then raise exception 'সংবাদ বিভাগ পাওয়া যায়নি'; end if;
  insert into public.articles (author_id, category_id, slug, title, excerpt, body, hero_media_key, status, published_at)
    values (
      actor, category, lower(trim(p_slug)), trim(p_title), trim(p_excerpt), trim(p_body), nullif(trim(p_hero_media_key), ''),
      case when actor_role = 'reporter' and actor_tier = 'junior' then 'pending'::public.article_status else 'published'::public.article_status end,
      case when actor_role = 'reporter' and actor_tier = 'junior' then null else now() end
    ) returning * into created;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (created.id, actor, 1, created.title, created.excerpt, created.body, 'প্রাথমিক জমা');
  if created.status = 'published' then perform public.add_article_earning(created.id, actor); end if;
  return created;
end;
$$;

create or replace function public.moderate_article(p_article_id uuid, p_decision text, p_reason text)
returns public.articles
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  updated public.articles;
  logged_action text;
begin
  if not public.is_moderator_or_admin() then raise exception 'மோடரேட்டர் அனுமதி প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then raise exception 'செயல் காரணம் ৩–৫০০ எழுத்துகளாக இருக்க வேண்டும்'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'தீர்மானம் অনুমোদন বা প্রত্যাখ্যান হতে হবে'; end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null or target.status <> 'pending' then raise exception 'প্রতিবেদনটি আর অপেক্ষমাণ অবস্থায় নেই'; end if;
  if target.author_id = actor and p_decision = 'approve' then raise exception 'নিজের প্রতিবেদন নিজে অনুমোদন করা যাবে না' using errcode = '42501'; end if;
  logged_action := case when p_decision = 'approve' then 'approve_article' else 'reject_article' end;
  update public.articles set
    status = case when p_decision = 'approve' then 'published'::public.article_status else 'rejected'::public.article_status end,
    published_at = case when p_decision = 'approve' then now() else null end,
    rejected_at = case when p_decision = 'reject' then now() else null end,
    rejection_reason = case when p_decision = 'reject' then trim(p_reason) else null end
    where id = p_article_id returning * into updated;
  insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason)
    values (actor, logged_action, p_article_id, target.author_id, trim(p_reason));
  if p_decision = 'approve' then perform public.add_article_earning(p_article_id, target.author_id); end if;
  return updated;
end;
$$;

create or replace function public.update_own_article(p_article_id uuid, p_title text, p_excerpt text, p_body text, p_reason text)
returns public.articles language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  next_version integer;
  result public.articles;
  actor_role public.app_role;
  actor_tier public.reporter_tier;
begin
  select role, reporter_tier into actor_role, actor_tier from public.user_roles where user_id = actor;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then raise exception 'সম্পাদনার কারণ আবশ্যক (৩–৫০০ অক্ষর)'; end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null or target.author_id <> actor or target.status <> 'published' then raise exception 'প্রকাশিত নিজের প্রতিবেদন সম্পাদনা করার অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if actor_role not in ('admin', 'moderator') and not (actor_role = 'reporter' and actor_tier = 'executive') then raise exception 'এই রিপোর্টার স্তরে প্রকাশিত প্রতিবেদন সম্পাদনা করা যাবে না' using errcode = '42501'; end if;
  select coalesce(max(version), 0) + 1 into next_version from public.article_revisions where article_id = p_article_id;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (p_article_id, actor, next_version, target.title, target.excerpt, target.body, trim(p_reason));
  update public.articles set title = trim(p_title), excerpt = trim(p_excerpt), body = trim(p_body)
    where id = p_article_id returning * into result;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (p_article_id, actor, next_version + 1, result.title, result.excerpt, result.body, trim(p_reason));
  if actor_role in ('admin', 'moderator') then
    insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason, details)
      values (actor, 'edit_article', p_article_id, target.author_id, trim(p_reason), jsonb_build_object('revision', next_version + 1));
  end if;
  return result;
end;
$$;

create or replace function public.moderate_comment(p_comment_id uuid, p_decision text, p_reason text)
returns public.comments language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.comments;
  result public.comments;
  next_status public.comment_status;
  logged_action text;
begin
  if not public.is_moderator_or_admin() then raise exception 'மோடரேட்டர் அனுமதி প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then raise exception 'மோடரேஷன் காரணம் আবশ্যক'; end if;
  next_status := case p_decision when 'restore' then 'visible'::public.comment_status when 'hide' then 'hidden'::public.comment_status when 'remove' then 'removed'::public.comment_status else null end;
  if next_status is null then raise exception 'தீர்மானம் செல்லாது'; end if;
  select * into target from public.comments where id = p_comment_id for update;
  if target.id is null then raise exception 'கருத்து கிடைக்கவில்லை'; end if;
  logged_action := case p_decision when 'restore' then 'restore_comment' when 'hide' then 'hide_comment' else 'remove_comment' end;
  update public.comments set status = next_status where id = p_comment_id returning * into result;
  insert into public.moderation_actions (actor_id, action, comment_id, target_user_id, reason)
    values (actor, logged_action, p_comment_id, target.author_id, trim(p_reason));
  return result;
end;
$$;

create or replace function public.apply_reporter(p_motivation text)
returns public.reporter_applications language plpgsql security definer set search_path = '' as $$
declare result public.reporter_applications;
begin
  if (select auth.uid()) is null then raise exception 'தயவுசெய்து முதலில் உள்நுழையவும்' using errcode = '42501'; end if;
  if public.current_app_role() <> 'reader' then raise exception 'இந்தக் கணக்கின் தற்போதைய பதவி விண்ணப்பிக்க அனுமதிக்காது'; end if;
  insert into public.reporter_applications (applicant_id, motivation)
    values ((select auth.uid()), trim(p_motivation)) returning * into result;
  return result;
end;
$$;

create or replace function public.assign_user_role(p_user_id uuid, p_role public.app_role, p_tier public.reporter_tier, p_reason text)
returns public.user_roles language plpgsql security definer set search_path = '' as $$
declare
  old public.user_roles;
  result public.user_roles;
begin
  if not public.is_admin() then raise exception 'நிர்வாக அனுமதி தேவை' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then raise exception 'பதவி மாற்றத்தின் காரணம் கட்டாயம் (৩–৫০০ எழுத்துகள்)'; end if;
  if p_role = 'reporter' and p_tier is null then raise exception 'ரிப்போர்ட்டருக்கு ஒரு அடுக்கு தேர்ந்தெடுக்கவும்'; end if;
  if p_role = 'reader' and p_tier is not null then raise exception 'ரீடருக்கு ரிப்போர்டர் அடுக்கு வழங்க முடியாது'; end if;
  select * into old from public.user_roles where user_id = p_user_id for update;
  if old.user_id is null then raise exception 'பயனர் கிடைக்கவில்லை'; end if;
  if old.role = 'admin' and p_role <> 'admin' and (select count(*) from public.user_roles where role = 'admin') <= 1 then raise exception 'கடைசி நிர்வாகியை பதவிநீக்கம் செய்ய முடியாது'; end if;
  update public.user_roles set role = p_role, reporter_tier = p_tier, assigned_by = (select auth.uid()), updated_at = now()
    where user_id = p_user_id returning * into result;
  insert into public.moderation_actions (actor_id, action, target_user_id, reason, details)
    values ((select auth.uid()), 'assign_role', p_user_id, trim(p_reason), jsonb_build_object('old_role', old.role, 'new_role', p_role, 'old_tier', old.reporter_tier, 'new_tier', p_tier));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values ((select auth.uid()), 'assign_role', p_user_id, trim(p_reason), jsonb_build_object('role', p_role, 'tier', p_tier));
  return result;
end;
$$;

create or replace function public.request_withdrawal(p_amount_tk integer, p_method text, p_payout_number text)
returns public.withdrawals language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  details public.profile_details;
  completion integer;
  available integer;
  prior_paid integer;
  published_count integer;
  result public.withdrawals;
begin
  if actor is null then raise exception 'உள்நுழைய வேண்டும்' using errcode = '42501'; end if;
  if p_amount_tk < 3000 then raise exception 'குறைந்தபட்ச பணத்திருப்பம் ৳৩,০০০'; end if;
  if p_method not in ('bkash', 'nagad') then raise exception 'বিকাশ বা নগদ নির্বাচন করুন'; end if;
  select * into details from public.profile_details where user_id = actor for update;
  completion := public.profile_completion_for(actor);
  if completion <> 100 then raise exception 'பணம் எடுக்க ১০০% சுயவிவர நிறைவு அவசியம்'; end if;
  if details.payout_method <> p_method or details.payout_number <> trim(p_payout_number) then raise exception 'பணம் பெறும் விபரம் உங்கள் தனிப்பட்ட சுயவிவர விவரங்களுடன் பொருந்த வேண்டும்'; end if;
  if exists (select 1 from public.withdrawals where user_id = actor and status = 'pending') then raise exception 'முந்தைய பணத்திருப்பம் முடியும் வரை காத்திருக்கவும்'; end if;
  select count(*) into prior_paid from public.withdrawals where user_id = actor and status = 'paid';
  if prior_paid = 0 then
    select count(*) into published_count from public.articles where author_id = actor and status = 'published';
    if published_count < 35 then raise exception 'முதல் பணத்திருப்பத்திற்கு ৩৫ பிரசுரமான செய்திகள் தேவை (தற்போது %)', published_count; end if;
  end if;
  select coalesce(sum(amount_tk), 0)::integer into available from public.earnings_ledger
    where user_id = actor and entry_type in ('article_earning_available', 'profile_release', 'withdrawal_reserve', 'withdrawal_refund', 'manual_adjustment');
  if available < p_amount_tk then raise exception 'உங்களின் উত্তোলনযোগ্য இருப்பு போதாது'; end if;
  insert into public.withdrawals (user_id, amount_tk, method, payout_number_snapshot)
    values (actor, p_amount_tk, p_method, trim(p_payout_number)) returning * into result;
  insert into public.earnings_ledger (user_id, withdrawal_id, entry_type, amount_tk, reason)
    values (actor, result.id, 'withdrawal_reserve', -p_amount_tk, 'பணத்திருப்ப கோரிக்கை');
  return result;
end;
$$;

create or replace function public.review_withdrawal(p_withdrawal_id uuid, p_decision text, p_reason text)
returns public.withdrawals language plpgsql security definer set search_path = '' as $$
declare target public.withdrawals; result public.withdrawals;
begin
  if not public.is_admin() then raise exception 'நிர்வாக அனுமதி தேவை' using errcode = '42501'; end if;
  if p_decision not in ('paid', 'rejected') then raise exception 'தீர்மானம் அனுமதி அல்லது நிராகரிப்பு ஆக வேண்டும்'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then raise exception 'ஒவ்வொரு பணத்திருப்ப முடிவுக்கும் காரணம் தேவை'; end if;
  select * into target from public.withdrawals where id = p_withdrawal_id for update;
  if target.id is null or target.status <> 'pending' then raise exception 'இந்த கோரிக்கை நிலுவையில் இல்லை'; end if;
  update public.withdrawals set status = p_decision::public.withdrawal_status, review_reason = trim(p_reason), reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = p_withdrawal_id returning * into result;
  if p_decision = 'rejected' then
    insert into public.earnings_ledger (user_id, withdrawal_id, entry_type, amount_tk, reason, created_by)
      values (target.user_id, target.id, 'withdrawal_refund', target.amount_tk, trim(p_reason), (select auth.uid()));
  end if;
  insert into public.moderation_actions (actor_id, action, target_user_id, withdrawal_id, reason, details)
    values ((select auth.uid()), 'review_withdrawal', target.user_id, target.id, trim(p_reason), jsonb_build_object('decision', p_decision, 'amount_tk', target.amount_tk));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values ((select auth.uid()), 'review_withdrawal', target.id, trim(p_reason), jsonb_build_object('decision', p_decision, 'amount_tk', target.amount_tk));
  return result;
end;
$$;

create or replace function public.admin_adjust_balance(p_user_id uuid, p_amount_tk integer, p_reason text)
returns public.earnings_ledger language plpgsql security definer set search_path = '' as $$
declare result public.earnings_ledger;
begin
  if not public.is_admin() then raise exception 'நிர்வாக அனுமதி தேவை' using errcode = '42501'; end if;
  if p_amount_tk = 0 or char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then raise exception 'தொகையும் சரியான காரணமும் தேவை'; end if;
  insert into public.earnings_ledger (user_id, entry_type, amount_tk, reason, created_by)
    values (p_user_id, 'manual_adjustment', p_amount_tk, trim(p_reason), (select auth.uid())) returning * into result;
  insert into public.moderation_actions (actor_id, action, target_user_id, reason, details)
    values ((select auth.uid()), 'adjust_balance', p_user_id, trim(p_reason), jsonb_build_object('amount_tk', p_amount_tk));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values ((select auth.uid()), 'adjust_balance', p_user_id, trim(p_reason), jsonb_build_object('amount_tk', p_amount_tk));
  return result;
end;
$$;

-- The only bootstrap path: set the intended Google account's email in app_settings
-- through the Supabase SQL editor once before launch. First matching signed-in
-- person claims admin; after that the switch is permanently consumed.
create or replace function public.bootstrap_first_admin()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  expected_email text;
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  target uuid := (select auth.uid());
begin
  if target is null then return false; end if;
  select value into expected_email from public.app_settings where key = 'initial_admin_email' for update;
  if coalesce(expected_email, '') = '' or lower(expected_email) <> current_email then return false; end if;
  if exists (select 1 from public.user_roles where role = 'admin') then return false; end if;
  if exists (select 1 from public.app_settings where key = 'initial_admin_claimed' and value = 'true') then return false; end if;
  update public.user_roles set role = 'admin', reporter_tier = null, assigned_by = target, updated_at = now() where user_id = target;
  update public.app_settings set value = 'true', updated_at = now() where key = 'initial_admin_claimed';
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (target, 'bootstrap_first_admin', target, 'ஒற்றை நிறுவல் நிர்வாகி துவக்கம்', jsonb_build_object('email', current_email));
  return true;
end;
$$;

-- RLS helpers avoid recursive policies and never expose private identity details.
alter table public.profiles enable row level security;
alter table public.profile_details enable row level security;
alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.articles enable row level security;
alter table public.article_revisions enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.bookmarks enable row level security;
alter table public.reporter_applications enable row level security;
alter table public.withdrawals enable row level security;
alter table public.earnings_ledger enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.app_settings enable row level security;

create policy profiles_public_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_owner_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profile_details_owner_read on public.profile_details for select to authenticated using (user_id = (select auth.uid()));
create policy profile_details_owner_insert on public.profile_details for insert to authenticated with check (user_id = (select auth.uid()));
create policy profile_details_owner_update on public.profile_details for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy roles_owner_or_admin_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy categories_public_read on public.categories for select to anon, authenticated using (active or (select public.is_admin()));
create policy articles_published_read on public.articles for select to anon, authenticated
  using (status = 'published' or author_id = (select auth.uid()) or (select public.is_moderator_or_admin()));
create policy revisions_owner_or_moderator_read on public.article_revisions for select to authenticated
  using (exists (select 1 from public.articles a where a.id = article_id and (a.author_id = (select auth.uid()) or (select public.is_moderator_or_admin()))));
create policy comments_visible_read on public.comments for select to anon, authenticated
  using ((status = 'visible' and exists (select 1 from public.articles a where a.id = article_id and a.status = 'published'))
         or author_id = (select auth.uid()) or (select public.is_moderator_or_admin()));
create policy comments_reader_insert on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'visible' and exists (select 1 from public.articles a where a.id = article_id and a.status = 'published'));
create policy reactions_public_read on public.reactions for select to anon, authenticated
  using (exists (select 1 from public.articles a where a.id = article_id and a.status = 'published'));
create policy reactions_owner_insert on public.reactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy reactions_owner_delete on public.reactions for delete to authenticated using (user_id = (select auth.uid()));
create policy bookmarks_owner_read on public.bookmarks for select to authenticated using (user_id = (select auth.uid()));
create policy bookmarks_owner_insert on public.bookmarks for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.articles a where a.id = article_id and a.status = 'published')
);
create policy bookmarks_owner_delete on public.bookmarks for delete to authenticated using (user_id = (select auth.uid()));
create policy application_owner_read on public.reporter_applications for select to authenticated
  using (applicant_id = (select auth.uid()) or (select public.is_admin()));
create policy application_owner_insert on public.reporter_applications for insert to authenticated
  with check (applicant_id = (select auth.uid()) and status = 'pending');
create policy withdrawals_owner_or_admin_read on public.withdrawals for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy ledger_owner_or_admin_read on public.earnings_ledger for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy moderation_admin_read on public.moderation_actions for select to authenticated using ((select public.is_admin()));
create policy admin_audit_admin_read on public.admin_audit_log for select to authenticated using ((select public.is_admin()));

-- Remove implicit/default table grants; explicitly grant only the actions guarded by RLS.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.categories, public.articles, public.comments, public.reactions to anon, authenticated;
grant update (username, display_name, avatar_url, bio) on public.profiles to authenticated;
grant select, insert, update on public.profile_details to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.article_revisions to authenticated;
grant insert on public.comments to authenticated;
grant select, insert, delete on public.reactions to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
grant select, insert on public.reporter_applications to authenticated;
grant select on public.withdrawals, public.earnings_ledger to authenticated;
grant select on public.moderation_actions, public.admin_audit_log to authenticated;

-- RPC execute permissions are explicit; role/ledger mutations happen only via the
-- audited SECURITY DEFINER functions below, never by a direct client table write.
revoke all on function public.current_app_role() from public, anon;
revoke all on function public.is_moderator_or_admin() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.profile_completion_for(uuid) from public, anon, authenticated;
revoke all on function public.add_article_earning(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_held_earnings() from public, anon, authenticated;
revoke all on function public.release_held_earnings_on_identity_change() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.submit_article(text, text, text, text, text, text) from public, anon;
revoke all on function public.moderate_article(uuid, text, text) from public, anon;
revoke all on function public.update_own_article(uuid, text, text, text, text) from public, anon;
revoke all on function public.moderate_comment(uuid, text, text) from public, anon;
revoke all on function public.apply_reporter(text) from public, anon;
revoke all on function public.assign_user_role(uuid, public.app_role, public.reporter_tier, text) from public, anon;
revoke all on function public.request_withdrawal(integer, text, text) from public, anon;
revoke all on function public.review_withdrawal(uuid, text, text) from public, anon;
revoke all on function public.admin_adjust_balance(uuid, integer, text) from public, anon;
revoke all on function public.bootstrap_first_admin() from public, anon;
revoke all on function public.get_my_profile_completion() from public, anon;
revoke all on function public.get_my_wallet() from public, anon;
revoke all on function public.get_article_stats(uuid) from public;
grant execute on function public.current_app_role(), public.is_moderator_or_admin(), public.is_admin() to authenticated;
grant execute on function public.reporter_fee_for_tier(public.reporter_tier) to anon, authenticated;
grant execute on function public.get_my_profile_completion(), public.get_my_wallet() to authenticated;
grant execute on function public.get_article_stats(uuid) to anon, authenticated;
grant execute on function public.submit_article(text, text, text, text, text, text), public.moderate_article(uuid, text, text), public.update_own_article(uuid, text, text, text, text), public.moderate_comment(uuid, text, text), public.apply_reporter(text), public.assign_user_role(uuid, public.app_role, public.reporter_tier, text), public.request_withdrawal(integer, text, text), public.review_withdrawal(uuid, text, text), public.admin_adjust_balance(uuid, integer, text), public.bootstrap_first_admin() to authenticated;

commit;
