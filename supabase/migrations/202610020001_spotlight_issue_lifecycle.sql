-- Spotlight becomes an issue tracker, not only a wall of complaints.
--
-- A post stays 'open' until somebody decides about it. The author can settle their own issue and
-- the desk can settle any of them; nobody else. Solving asks who did it, how long it took from
-- the buckets the site publishes, and for pictures as proof; calling something irrelevant asks
-- for the reason. Every mark appends an event, because the statistics have to know when a solve
-- happened and the history has to survive a post being re-marked.
--
-- Visibility ('status': visible/hidden, from the moderation migration) is deliberately a separate
-- axis: hiding a post is a desk decision about what the public may read, while issue_status is
-- the shared record of whether the problem was fixed. The two must not overwrite each other.
begin;

alter table public.spotlight_posts
  add column if not exists issue_status text not null default 'open';
alter table public.spotlight_posts
  add constraint spotlight_posts_issue_status_check
  check (issue_status in ('open', 'in_progress', 'solved', 'invalid'));

alter table public.spotlight_posts add column if not exists solver_kind text;
alter table public.spotlight_posts add constraint spotlight_posts_solver_kind_check
  check (solver_kind is null or solver_kind in (
    'authority', 'student_wing', 'volunteers', 'dean_office',
    'hall_authority', 'faculty_department', 'other'));
alter table public.spotlight_posts add column if not exists solver_name text;
alter table public.spotlight_posts add constraint spotlight_posts_solver_name_check
  check (solver_name is null or char_length(solver_name) <= 120);
alter table public.spotlight_posts add column if not exists solve_duration text;
alter table public.spotlight_posts add constraint spotlight_posts_solve_duration_check
  check (solve_duration is null or solve_duration in (
    'under_1h', '1_6h', '6_24h', '1_3d', '4_7d', '1_2w', '2_4w', 'over_1m'));
alter table public.spotlight_posts add column if not exists issue_note text;
alter table public.spotlight_posts add constraint spotlight_posts_issue_note_check
  check (issue_note is null or char_length(issue_note) <= 500);
alter table public.spotlight_posts add column if not exists marked_by uuid
  references public.profiles(id) on delete set null;
alter table public.spotlight_posts add column if not exists marked_at timestamptz;

create index if not exists spotlight_posts_issue_status_idx
  on public.spotlight_posts (issue_status, created_at desc);

-- Proof images reuse the Spotlight upload pipeline, so they live in the same R2 bucket and are
-- resolved through the same media gate as post pictures.
create table public.spotlight_resolution_media (
  post_id uuid not null references public.spotlight_posts(id) on delete cascade,
  media_id uuid not null references public.spotlight_media_assets(id) on delete restrict,
  position integer not null default 0,
  primary key (post_id, media_id)
);

-- Append-only. One row per mark, whatever direction the status moved.
create table public.spotlight_issue_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.spotlight_posts(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  from_status text,
  to_status text not null,
  solver_kind text,
  solver_name text,
  solve_duration text,
  note text,
  created_at timestamptz not null default now()
);
create index spotlight_issue_events_post_idx on public.spotlight_issue_events (post_id, created_at desc);
create index spotlight_issue_events_solved_idx on public.spotlight_issue_events (to_status, created_at desc);

alter table public.spotlight_resolution_media enable row level security;
alter table public.spotlight_issue_events enable row level security;

-- Proof pictures are public: they are the evidence a solved issue is actually solved. Attachment
-- rows carry ids and order only, never an object key.
create policy spotlight_resolution_media_public_read on public.spotlight_resolution_media
  for select to anon, authenticated using (true);
create policy spotlight_issue_events_public_read on public.spotlight_issue_events
  for select to anon, authenticated using (true);

-- Column-level read for the event log: who marked it is desk business, but what was decided and
-- by which body (solver_kind/solver_name) is the public record.
revoke all on public.spotlight_resolution_media, public.spotlight_issue_events from anon, authenticated;
grant select (post_id, media_id, position) on public.spotlight_resolution_media to anon, authenticated;
grant select (post_id, from_status, to_status, solver_kind, solver_name, solve_duration, note, created_at)
  on public.spotlight_issue_events to anon, authenticated;

-- The event log is written only from the SECURITY DEFINER RPC below.
create or replace function public.spotlight_issue_events_block_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'স্পটলাইট ইস্যুর ইতিহাস শুধু যুক্ত করা যায়' using errcode = '42501';
end;
$$;
create trigger spotlight_issue_events_append_only
  before update or delete on public.spotlight_issue_events
  for each row execute function public.spotlight_issue_events_block_write();

-- Appending to the same list rather than replacing it, so the older decisions stay recorded.
alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (
  action in ('approve_article', 'reject_article', 'hide_comment', 'remove_comment', 'restore_comment',
    'assign_role', 'review_application', 'review_withdrawal', 'edit_article', 'adjust_balance',
    'set_article_publication', 'moderate_spotlight', 'set_article_status', 'resolve_spotlight')
);

create or replace function public.mark_spotlight_issue(
  p_post_id uuid,
  p_status text,
  p_solver_kind text default null,
  p_solver_name text default null,
  p_solve_duration text default null,
  p_note text default null,
  p_media_ids text[] default null
)
returns public.spotlight_posts
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.spotlight_posts;
  result public.spotlight_posts;
  media text[] := '{}';
  media_key text;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  clean_name text := nullif(btrim(coalesce(p_solver_name, '')), '');
  solver text := case when p_status in ('solved', 'in_progress') then p_solver_kind else null end;
  duration text := case when p_status = 'solved' then p_solve_duration else null end;
  audit_reason text;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select * into target from public.spotlight_posts where id = p_post_id for update;
  if target.id is null then raise exception 'পোস্ট পাওয়া যায়নি'; end if;
  if target.author_id <> actor and not public.is_moderator_or_admin() then
    raise exception 'শুধু ইস্যুর লেখক বা সম্পাদকীয় ডেস্ক অবস্থা নির্ধারণ করতে পারেন' using errcode = '42501';
  end if;
  if p_status not in ('open', 'in_progress', 'solved', 'invalid') then
    raise exception 'ইস্যুর অবস্থা সঠিক নয়';
  end if;
  if p_status = 'solved' then
    if solver is null or solver not in ('authority', 'student_wing', 'volunteers', 'dean_office',
      'hall_authority', 'faculty_department', 'other') then
      raise exception 'সমাধান করেছে—কে, তা নির্বাচন করুন';
    end if;
    if duration is null or duration not in ('under_1h', '1_6h', '6_24h', '1_3d',
      '4_7d', '1_2w', '2_4w', 'over_1m') then
      raise exception 'সমাধানে কত সময় লেগেছে তা নির্বাচন করুন';
    end if;
  elsif p_status = 'in_progress' then
    if solver is null or solver not in ('authority', 'student_wing', 'volunteers', 'dean_office',
      'hall_authority', 'faculty_department', 'other') then
      raise exception 'কাজটি কে করছে, তা নির্বাচন করুন';
    end if;
  elsif p_status = 'invalid' then
    if clean_note is null or char_length(clean_note) < 3 or char_length(clean_note) > 500 then
      raise exception 'ভিত্তিহীন বা অপ্রাসঙ্গিক হিসেবে চিহ্নিত করতে কারণ লিখুন (৩–৫০০ অক্ষর)';
    end if;
  end if;
  if clean_name is not null and char_length(clean_name) > 120 then
    raise exception 'নাম ১২০ অক্ষরের মধ্যে দিন';
  end if;

  if p_media_ids is not null then
    select coalesce(array_agg(dedup.k order by dedup.ord), '{}') into media
      from (select lower(btrim(entry.k)) as k, min(entry.ord) as ord
              from unnest(p_media_ids) with ordinality as entry(k, ord)
             where entry.k is not null and btrim(entry.k) <> '' group by 1) dedup;
  end if;
  if coalesce(array_length(media, 1), 0) > 6 then raise exception 'প্রমাণে সর্বোচ্চ ৬টি ছবি যুক্ত করা যায়'; end if;
  foreach media_key in array media loop
    if media_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'প্রমাণের ছবির তালিকায় অবৈধ ফাইল আইডি আছে';
    end if;
    perform 1 from public.spotlight_media_assets m
     where m.id = media_key::uuid and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then raise exception 'প্রমাণের ছবিগুলো আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি'; end if;
  end loop;

  update public.spotlight_posts set
    issue_status = p_status,
    solver_kind = solver,
    solver_name = case when solver is null then null else clean_name end,
    solve_duration = duration,
    issue_note = clean_note,
    marked_by = actor,
    marked_at = now()
  where id = p_post_id
  returning * into result;

  delete from public.spotlight_resolution_media where post_id = p_post_id;
  if p_status = 'solved' and coalesce(array_length(media, 1), 0) > 0 then
    insert into public.spotlight_resolution_media (post_id, media_id, position)
      select p_post_id, item.key::uuid, item.ord - 1 from unnest(media) with ordinality as item(key, ord);
  end if;

  insert into public.spotlight_issue_events (
    post_id, actor_id, from_status, to_status, solver_kind, solver_name, solve_duration, note)
    values (p_post_id, actor, target.issue_status, p_status, solver, clean_name, duration, clean_note);

  audit_reason := case
    when clean_note is not null and char_length(clean_note) >= 3 then clean_note
    else 'স্পটলাইট ইস্যুর অবস্থা পরিবর্তন'
  end;
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'resolve_spotlight', p_post_id, audit_reason,
      jsonb_build_object('from', target.issue_status, 'to', p_status,
        'solver_kind', solver, 'solver_name', clean_name,
        'solve_duration', duration, 'author_id', target.author_id));
  insert into public.moderation_actions (actor_id, action, target_user_id, reason, details)
    values (actor, 'resolve_spotlight', target.author_id, audit_reason,
      jsonb_build_object('post_id', p_post_id, 'from', target.issue_status, 'to', p_status,
        'solver_kind', solver, 'solve_duration', duration));
  return result;
end;
$$;

-- Proof pictures must resolve through the same gate as post pictures, or a solved issue would show
-- broken images to everyone but its owner.
create or replace function public.get_spotlight_media(p_media_id uuid)
returns table (
  id uuid,
  owner_id uuid,
  original_key text,
  derivative_key text,
  mime_type text,
  original_bytes bigint,
  derivative_bytes bigint
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.owner_id, m.original_key, m.derivative_key, m.mime_type, m.original_bytes, m.derivative_bytes
    from public.spotlight_media_assets m
   where m.id = p_media_id
     and (
       exists (select 1 from public.spotlight_post_media pm where pm.media_id = m.id)
       or exists (select 1 from public.spotlight_resolution_media rm where rm.media_id = m.id)
       or m.owner_id = (select auth.uid())
       or (select public.is_moderator_or_admin())
     )
$$;

revoke all on function public.mark_spotlight_issue(uuid, text, text, text, text, text, text[]) from public, anon;
grant execute on function public.mark_spotlight_issue(uuid, text, text, text, text, text, text[]) to authenticated;

commit;
