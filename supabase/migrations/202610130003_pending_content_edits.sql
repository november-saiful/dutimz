-- Post-publication edits that need a moderator's approval.
--
-- `update_own_article` published a reporter's correction the instant it was sent, and only for
-- executive-tier reporters at that. Anyone below that tier could not correct their own story at
-- all. This migration replaces both halves of that: every reporter tier may request a change to a
-- story they filed (or a post they raised in Spotlight), and nothing reaches the reader until a
-- moderator or an administrator approves the request from the moderation desk.
--
-- A request is a staging row, never a half-applied story. `submit_*_edit` writes nothing to
-- `articles` or `spotlight_posts`; `moderate_*_edit` is the only thing that does, and it goes
-- through the same revision pair the desk edit has always written. That is what keeps the live
-- story, the revision history and the audit log telling the same story as the decision.
--
-- The desk's own edit from `/account/admin` still applies immediately through
-- `admin_update_article`: an administrator is already the approval authority, and queueing their
-- correction behind a second administrator would be ceremony, not review. Self-approval is refused
-- here exactly as `moderate_article` refuses it, so the rule holds whichever door was used.
begin;

/*
  One pending request per story, and one per post: the same shape as
  `one_pending_reporter_application_per_user`, so a writer cannot queue a second correction while
  the first is still waiting and leave the desk guessing which one to judge.
*/
create table public.article_edit_requests (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  editor_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  excerpt text not null,
  body text not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  -- A settled request must record who settled it, and how; a pending one must not pretend to.
  constraint article_edit_review_data check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null)
    or (status <> 'pending' and reviewed_at is not null and reviewed_by is not null
        and nullif(trim(review_reason), '') is not null)
  )
);
create unique index article_edit_requests_one_pending
  on public.article_edit_requests (article_id) where status = 'pending';
-- The writer's own list ("is my correction still waiting?"), and the desk's queue, in one index each.
create index article_edit_requests_editor_idx
  on public.article_edit_requests (editor_id, created_at desc);
create index article_edit_requests_pending_idx
  on public.article_edit_requests (created_at asc) where status = 'pending';

create table public.spotlight_edit_requests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.spotlight_posts(id) on delete cascade,
  editor_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  constraint spotlight_edit_review_data check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null)
    or (status <> 'pending' and reviewed_at is not null and reviewed_by is not null
        and nullif(trim(review_reason), '') is not null)
  )
);
create unique index spotlight_edit_requests_one_pending
  on public.spotlight_edit_requests (post_id) where status = 'pending';
create index spotlight_edit_requests_editor_idx
  on public.spotlight_edit_requests (editor_id, created_at desc);
create index spotlight_edit_requests_pending_idx
  on public.spotlight_edit_requests (created_at asc) where status = 'pending';

alter table public.article_edit_requests enable row level security;
alter table public.spotlight_edit_requests enable row level security;

-- A writer sees their own request and its verdict; the desk sees every request. Nothing else reads
-- these rows, and the grants below give no client a way to write one.
create policy article_edit_requests_editor_read on public.article_edit_requests
  for select to authenticated using (editor_id = (select auth.uid()));
create policy article_edit_requests_desk_read on public.article_edit_requests
  for select to authenticated using ((select public.is_moderator_or_admin()));
create policy spotlight_edit_requests_editor_read on public.spotlight_edit_requests
  for select to authenticated using (editor_id = (select auth.uid()));
create policy spotlight_edit_requests_desk_read on public.spotlight_edit_requests
  for select to authenticated using ((select public.is_moderator_or_admin()));

revoke all on public.article_edit_requests, public.spotlight_edit_requests from anon, authenticated;
grant select on public.article_edit_requests, public.spotlight_edit_requests to authenticated;

/*
  The moderation log's vocabulary. The list below is the one `202610020001_spotlight_issue_lifecycle`
  last wrote, carried forward in full and extended with the four decisions this migration adds —
  dropping a value here would silently start rejecting a decision some other function still makes.
*/
alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (
  action in ('approve_article', 'reject_article', 'hide_comment', 'remove_comment', 'restore_comment',
    'assign_role', 'review_application', 'review_withdrawal', 'edit_article', 'adjust_balance',
    'set_article_publication', 'moderate_spotlight', 'set_article_status', 'resolve_spotlight',
    'approve_article_edit', 'reject_article_edit',
    'approve_spotlight_edit', 'reject_spotlight_edit')
);

/*
  The author of record of a story, whether their name is on it or it was filed anonymously.
  `admin_update_article` and `update_own_article` both spell this out inline; it is one rule, so it
  lives in one function here.
*/
create or replace function public.article_author_of_record(p_article_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select a.author_id from public.articles a where a.id = p_article_id),
    (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id)
  )
$$;

/*
  Request an edit to your own published story.

  Nothing is written to `articles` here, and that is the whole point: the request is a proposal the
  desk judges. Any reporter tier may ask — the tier that used to gate this door is gone.
*/
create or replace function public.submit_article_edit(
  p_article_id uuid,
  p_title text,
  p_excerpt text,
  p_body text,
  p_reason text
)
returns public.article_edit_requests
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_role public.app_role;
  target public.articles;
  owner_id uuid;
  excerpt_text text;
  inline_media uuid[];
  gallery_media uuid[];
  media_key uuid;
  created public.article_edit_requests;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select role into actor_role from public.user_roles where user_id = actor;
  if actor_role not in ('reporter', 'moderator', 'admin') then
    raise exception 'প্রতিবেদন সম্পাদনার অনুমতি প্রয়োজন' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'সম্পাদনার কারণ আবশ্যক (৩–৫০০ অক্ষর)';
  end if;

  select * into target from public.articles where id = p_article_id;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  owner_id := public.article_author_of_record(p_article_id);
  if owner_id is distinct from actor then
    raise exception 'নিজের প্রকাশিত প্রতিবেদনের সম্পাদনা অনুরোধ করা যাবে' using errcode = '42501';
  end if;
  if target.status <> 'published' then
    raise exception 'কেবল প্রকাশিত প্রতিবেদনের সম্পাদনা অনুরোধ করা যায়';
  end if;

  -- The column's own constraints, checked here so the writer reads a sentence about their
  -- correction instead of a constraint name when it is approved.
  if char_length(trim(coalesce(p_title, ''))) not between 5 and 180 then
    raise exception 'শিরোনাম ৫–১৮০ অক্ষরের মধ্যে হতে হবে';
  end if;
  if char_length(trim(coalesce(p_body, ''))) < 100 then
    raise exception 'পূর্ণ প্রতিবেদন কমপক্ষে ১০০ অক্ষরের হতে হবে';
  end if;
  if p_excerpt is not null and char_length(trim(p_excerpt)) not between 10 and 280 then
    raise exception 'সংক্ষিপ্ত পরিচিতি ১০–২৮০ অক্ষরের মধ্যে হতে হবে';
  end if;
  excerpt_text := coalesce(nullif(trim(coalesce(p_excerpt, '')), ''), public.derive_excerpt(p_body));

  -- Pictures the correction places in its text. They must be this writer's own uploads: the
  -- approved body inserts them into `article_media`, which is what makes them readable once the
  -- story is public, so nothing another account uploaded may be attached this way.
  inline_media := coalesce(public.body_media_ids(p_body, '/media'), '{}');
  foreach media_key in array inline_media loop
    perform 1 from public.media_assets m
      where m.id = media_key and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then
      raise exception 'যোগ করা ছবিগুলো আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি';
    end if;
  end loop;
  -- Refused as a sentence rather than as an index violation, so the writer is told why.
  select coalesce(array_agg(am.media_id order by am.position), '{}') into gallery_media
    from public.article_media am where am.article_id = p_article_id and am.is_gallery;
  if (select count(distinct attached.media_id)
        from (
          select unnest(gallery_media) as media_id
          union select unnest(inline_media)
          union select nullif(target.hero_media_key, '')::uuid
        ) attached
       where attached.media_id is not null) > 10 then
    raise exception 'একটি প্রতিবেদনে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;

  if exists (select 1 from public.article_edit_requests r
              where r.article_id = p_article_id and r.status = 'pending') then
    raise exception 'এই প্রতিবেদনের একটি সম্পাদনার অনুরোধ এখনো অনুমোদনের অপেক্ষায় আছে';
  end if;

  insert into public.article_edit_requests (article_id, editor_id, title, excerpt, body, reason)
    values (p_article_id, actor, trim(p_title), excerpt_text, trim(p_body), trim(p_reason))
    returning * into created;
  return created;
end;
$$;

/*
  Judge a requested edit to a story.

  Approving is the only thing in this migration that writes `articles`, and it writes the same
  before/after revision pair `admin_update_article` writes, so a correction approved from the desk
  leaves the identical history as one made by the desk. It never touches the status or the dateline:
  the request carries text, not publication.
*/
create or replace function public.moderate_article_edit(
  p_request_id uuid,
  p_decision text,
  p_reason text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  request public.article_edit_requests;
  target public.articles;
  updated public.articles;
  owner_id uuid;
  next_version integer;
  excerpt_text text;
  proposed_inline uuid[];
  gallery_media uuid[];
  gallery_offset integer;
  media_key uuid;
begin
  if not public.is_moderator_or_admin() then
    raise exception 'মডারেটর অনুমতি প্রয়োজন' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'সিদ্ধান্ত অনুমোদন অথবা প্রত্যাখ্যান হতে হবে';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'সিদ্ধান্তের কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;

  select * into request from public.article_edit_requests where id = p_request_id for update;
  if request.id is null then raise exception 'সম্পাদনার অনুরোধ পাওয়া যায়নি'; end if;
  if request.status <> 'pending' then raise exception 'এই অনুরোধটি আর অপেক্ষমাণ অবস্থায় নেই'; end if;
  -- The desk may not wave through its own proposal, exactly as it may not approve its own story.
  if request.editor_id = actor then
    raise exception 'নিজের সম্পাদনার অনুরোধ নিজে অনুমোদন করা যাবে না' using errcode = '42501';
  end if;

  if p_decision = 'reject' then
    update public.article_edit_requests
       set status = 'rejected', reviewed_by = actor, reviewed_at = now(), review_reason = trim(p_reason)
     where id = p_request_id;
    insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason, details)
      values (actor, 'reject_article_edit', request.article_id, request.editor_id, trim(p_reason),
        jsonb_build_object('request_id', p_request_id));
    insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
      values (actor, 'reject_article_edit', p_request_id, trim(p_reason),
        jsonb_build_object('article_id', request.article_id, 'editor_id', request.editor_id));
    return;
  end if;

  select * into target from public.articles where id = request.article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  owner_id := public.article_author_of_record(request.article_id);
  excerpt_text := coalesce(nullif(trim(request.excerpt), ''), public.derive_excerpt(request.body));

  /*
    Reconcile body-owned attachments separately from gallery attachments. Each approved body image
    must belong to the author, and only inline-only rows are discarded when the body changes.
  */
  proposed_inline := coalesce(public.body_media_ids(request.body, '/media'), '{}');
  foreach media_key in array proposed_inline loop
    perform 1 from public.media_assets m
      where m.id = media_key and m.owner_id = request.editor_id and m.mime_type like 'image/%';
    if not found then
      raise exception 'যোগ করা ছবিগুলো লেখকের নিজের আপলোড করা নয় বা পাওয়া যায়নি';
    end if;
  end loop;
  select coalesce(array_agg(am.media_id order by am.position), '{}') into gallery_media
    from public.article_media am where am.article_id = request.article_id and am.is_gallery;
  if (select count(distinct attached.media_id)
        from (
          select unnest(gallery_media) as media_id
          union select unnest(proposed_inline)
          union select nullif(target.hero_media_key, '')::uuid
        ) attached
       where attached.media_id is not null) > 10 then
    raise exception 'একটি প্রতিবেদনে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;
  update public.article_media am set is_inline = false
   where am.article_id = request.article_id and am.is_inline;
  update public.article_media am set is_inline = true
   where am.article_id = request.article_id
     and am.is_gallery and am.media_id = any (proposed_inline);
  -- Remove obsolete inline-only rows while keeping gallery positions untouched.
  delete from public.article_media am
   where am.article_id = request.article_id and not am.is_gallery;
  -- Preserve gallery positions; reinsert inline-only pictures in their new body order.
  for media_key in
    select item.key from unnest(proposed_inline) with ordinality as item(key, ord)
     where not exists (select 1 from public.article_media am
                        where am.article_id = request.article_id and am.media_id = item.key)
     order by item.ord
  loop
    insert into public.article_media (article_id, media_id, position, is_gallery, is_inline)
    select request.article_id, media_key, coalesce(max(am.position) + 1, 0), false, true
      from public.article_media am where am.article_id = request.article_id;
  end loop;

  select coalesce(max(version), 0) + 1 into next_version
    from public.article_revisions where article_id = request.article_id;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (request.article_id, actor, next_version, target.title, target.excerpt, target.body, trim(p_reason));
  update public.articles
     set title = trim(request.title), excerpt = excerpt_text, body = trim(request.body)
   where id = request.article_id returning * into updated;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (request.article_id, actor, next_version + 1, updated.title, updated.excerpt, updated.body, trim(p_reason));

  update public.article_edit_requests
     set status = 'approved', reviewed_by = actor, reviewed_at = now(), review_reason = trim(p_reason)
   where id = p_request_id;

  insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason, details)
    values (actor, 'approve_article_edit', request.article_id, request.editor_id, trim(p_reason),
      jsonb_build_object('request_id', p_request_id, 'revision', next_version + 1));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'approve_article_edit', p_request_id, trim(p_reason),
      jsonb_build_object('article_id', request.article_id, 'editor_id', request.editor_id,
        'revision', next_version + 1));
end;
$$;

/*
  The same two doors for Spotlight. A post is public the moment it is raised, so a correction to it
  is the same question as a correction to a story, and it is answered in the same place.
*/
create or replace function public.submit_spotlight_edit(
  p_post_id uuid,
  p_title text,
  p_description text,
  p_reason text
)
returns public.spotlight_edit_requests
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.spotlight_posts;
  inline_media uuid[];
  gallery_media uuid[];
  media_key uuid;
  created public.spotlight_edit_requests;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'সম্পাদনার কারণ আবশ্যক (৩–৫০০ অক্ষর)';
  end if;

  select * into target from public.spotlight_posts where id = p_post_id;
  if target.id is null then raise exception 'পোস্ট পাওয়া যায়নি'; end if;
  if target.author_id <> actor then
    raise exception 'নিজের পোস্টের সম্পাদনা অনুরোধ করা যাবে' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 5 and 180 then
    raise exception 'শিরোনাম ৫–১৮০ অক্ষরের মধ্যে হতে হবে';
  end if;
  if char_length(trim(coalesce(p_description, ''))) not between 10 and 20000 then
    raise exception 'বিবরণ ১০–২০০০০ অক্ষরের মধ্যে হতে হবে';
  end if;

  inline_media := coalesce(public.body_media_ids(p_description, '/spotlight/media'), '{}');
  foreach media_key in array inline_media loop
    perform 1 from public.spotlight_media_assets m
      where m.id = media_key and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then
      raise exception 'যোগ করা ছবিগুলো আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি';
    end if;
  end loop;
  select coalesce(array_agg(pm.media_id order by pm.position), '{}') into gallery_media
    from public.spotlight_post_media pm where pm.post_id = p_post_id and pm.is_gallery;
  if (select count(distinct attached.media_id)
        from unnest(gallery_media || inline_media) as attached(media_id)) > 10 then
    raise exception 'একটি পোস্টে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;

  if exists (select 1 from public.spotlight_edit_requests r
              where r.post_id = p_post_id and r.status = 'pending') then
    raise exception 'এই পোস্টের একটি সম্পাদনার অনুরোধ এখনো অনুমোদনের অপেক্ষায় আছে';
  end if;

  insert into public.spotlight_edit_requests (post_id, editor_id, title, description, reason)
    values (p_post_id, actor, trim(p_title), trim(p_description), trim(p_reason))
    returning * into created;
  return created;
end;
$$;

create or replace function public.moderate_spotlight_edit(
  p_request_id uuid,
  p_decision text,
  p_reason text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  request public.spotlight_edit_requests;
  target public.spotlight_posts;
  proposed_inline uuid[];
  gallery_media uuid[];
  media_key uuid;
begin
  if not public.is_moderator_or_admin() then
    raise exception 'মডারেটর অনুমতি প্রয়োজন' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'সিদ্ধান্ত অনুমোদন অথবা প্রত্যাখ্যান হতে হবে';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'সিদ্ধান্তের কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;

  select * into request from public.spotlight_edit_requests where id = p_request_id for update;
  if request.id is null then raise exception 'সম্পাদনার অনুরোধ পাওয়া যায়নি'; end if;
  if request.status <> 'pending' then raise exception 'এই অনুরোধটি আর অপেক্ষমাণ অবস্থায় নেই'; end if;
  if request.editor_id = actor then
    raise exception 'নিজের সম্পাদনার অনুরোধ নিজে অনুমোদন করা যাবে না' using errcode = '42501';
  end if;

  if p_decision = 'reject' then
    update public.spotlight_edit_requests
       set status = 'rejected', reviewed_by = actor, reviewed_at = now(), review_reason = trim(p_reason)
     where id = p_request_id;
    insert into public.moderation_actions (actor_id, action, target_user_id, reason, details)
      values (actor, 'reject_spotlight_edit', request.editor_id, trim(p_reason),
        jsonb_build_object('request_id', p_request_id, 'post_id', request.post_id));
    insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
      values (actor, 'reject_spotlight_edit', p_request_id, trim(p_reason),
        jsonb_build_object('post_id', request.post_id, 'editor_id', request.editor_id));
    return;
  end if;

  select * into target from public.spotlight_posts where id = request.post_id for update;
  if target.id is null then raise exception 'পোস্ট পাওয়া যায়নি'; end if;

  -- Reconcile body-owned rows separately, retaining any independent gallery attachment.
  proposed_inline := coalesce(public.body_media_ids(request.description, '/spotlight/media'), '{}');
  foreach media_key in array proposed_inline loop
    perform 1 from public.spotlight_media_assets m
      where m.id = media_key and m.owner_id = request.editor_id and m.mime_type like 'image/%';
    if not found then
      raise exception 'যোগ করা ছবিগুলো লেখকের নিজের আপলোড করা নয় বা পাওয়া যায়নি';
    end if;
  end loop;
  select coalesce(array_agg(pm.media_id order by pm.position), '{}') into gallery_media
    from public.spotlight_post_media pm where pm.post_id = request.post_id and pm.is_gallery;
  if (select count(distinct attached.media_id)
        from unnest(gallery_media || proposed_inline) as attached(media_id)) > 10 then
    raise exception 'একটি পোস্টে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;
  update public.spotlight_post_media pm set is_inline = false
   where pm.post_id = request.post_id and pm.is_inline;
  update public.spotlight_post_media pm set is_inline = true
   where pm.post_id = request.post_id
     and pm.is_gallery and pm.media_id = any (proposed_inline);
  delete from public.spotlight_post_media pm
   where pm.post_id = request.post_id and not pm.is_gallery;
  for media_key in
    select item.key from unnest(proposed_inline) with ordinality as item(key, ord)
     where not exists (select 1 from public.spotlight_post_media pm
                        where pm.post_id = request.post_id and pm.media_id = item.key)
     order by item.ord
  loop
    insert into public.spotlight_post_media (post_id, media_id, position, is_gallery, is_inline)
    select request.post_id, media_key, coalesce(max(pm.position) + 1, 0), false, true
      from public.spotlight_post_media pm where pm.post_id = request.post_id;
  end loop;

  update public.spotlight_posts
     set title = trim(request.title), description = trim(request.description)
   where id = request.post_id;

  update public.spotlight_edit_requests
     set status = 'approved', reviewed_by = actor, reviewed_at = now(), review_reason = trim(p_reason)
   where id = p_request_id;

  insert into public.moderation_actions (actor_id, action, target_user_id, reason, details)
    values (actor, 'approve_spotlight_edit', request.editor_id, trim(p_reason),
      jsonb_build_object('request_id', p_request_id, 'post_id', request.post_id));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'approve_spotlight_edit', p_request_id, trim(p_reason),
      jsonb_build_object('post_id', request.post_id, 'editor_id', request.editor_id));
end;
$$;

/*
  `update_own_article` no longer edits anything.

  It used to write a correction to a published story the moment it was sent, for executive-tier
  reporters and the desk alone. A caller left over from that behaviour must not keep the old power
  silently, so the function is kept — same signature, same return type, so its existing grant and
  any caller still work — and it now only enqueues the request that a moderator will judge. It
  returns the story as it still stands, because nothing about it has changed yet.

  The return type is deliberately unchanged: altering a function's OUT type is not something
  `create or replace` can do, and a new name would be a breaking change for no benefit. Renaming it
  to `submit_article_edit` at the call sites is a follow-up.
*/
create or replace function public.update_own_article(
  p_article_id uuid,
  p_title text,
  p_excerpt text,
  p_body text,
  p_reason text
)
returns public.articles
language plpgsql security definer set search_path = '' as $$
declare
  result public.articles;
begin
  perform public.submit_article_edit(p_article_id, p_title, p_excerpt, p_body, p_reason);
  select * into result from public.articles where id = p_article_id;
  return result;
end;
$$;

revoke all on function public.article_author_of_record(uuid) from public, anon, authenticated;
revoke all on function public.submit_article_edit(uuid, text, text, text, text) from public, anon;
revoke all on function public.moderate_article_edit(uuid, text, text) from public, anon;
revoke all on function public.submit_spotlight_edit(uuid, text, text, text) from public, anon;
revoke all on function public.moderate_spotlight_edit(uuid, text, text) from public, anon;
revoke all on function public.update_own_article(uuid, text, text, text, text) from public, anon;
grant execute on function public.submit_article_edit(uuid, text, text, text, text) to authenticated;
grant execute on function public.moderate_article_edit(uuid, text, text) to authenticated;
grant execute on function public.submit_spotlight_edit(uuid, text, text, text) to authenticated;
grant execute on function public.moderate_spotlight_edit(uuid, text, text) to authenticated;
grant execute on function public.update_own_article(uuid, text, text, text, text) to authenticated;

commit;
