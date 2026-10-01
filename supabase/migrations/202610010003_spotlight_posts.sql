-- Spotlight: a forum where any signed-in member can raise an issue.
--
-- Posts carry a title, a description and an ordered set of photos. The photos live in their own
-- table because they are stored in a separate R2 bucket, so the article gallery's ownership and
-- read rules are not reused for objects that do not live beside them. Posting is open to every
-- authenticated member; the audited submission goes through one function so the client never holds
-- a direct insert grant on the posts table.
begin;

create table public.spotlight_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 5 and 180),
  description text not null check (char_length(trim(description)) between 10 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index spotlight_posts_recent_idx on public.spotlight_posts (created_at desc);
create index spotlight_posts_author_idx on public.spotlight_posts (author_id, created_at desc);

create table public.spotlight_media_assets (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  original_key text not null unique check (char_length(original_key) between 1 and 512),
  derivative_key text unique check (derivative_key is null or char_length(derivative_key) <= 512),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif')),
  original_bytes bigint not null check (original_bytes between 1 and 41943040),
  derivative_bytes bigint check (derivative_bytes is null or (derivative_bytes > 0 and derivative_bytes < original_bytes)),
  created_at timestamptz not null default now()
);

create table public.spotlight_post_media (
  post_id uuid not null references public.spotlight_posts(id) on delete cascade,
  media_id uuid not null references public.spotlight_media_assets(id) on delete restrict,
  position integer not null default 0,
  primary key (post_id, media_id)
);

create trigger spotlight_posts_touch_updated_at before update on public.spotlight_posts
  for each row execute function public.touch_updated_at();

alter table public.spotlight_posts enable row level security;
alter table public.spotlight_media_assets enable row level security;
alter table public.spotlight_post_media enable row level security;

-- Spotlight is a public forum: anyone may read a post and its pictures.
create policy spotlight_posts_public_read on public.spotlight_posts for select to anon, authenticated using (true);
create policy spotlight_post_media_public_read on public.spotlight_post_media for select to anon, authenticated using (true);
create policy spotlight_media_public_read on public.spotlight_media_assets for select to anon, authenticated using (true);
-- The uploader records its own object; nothing else writes the table directly.
create policy spotlight_media_owner_insert on public.spotlight_media_assets for insert to authenticated
  with check (owner_id = (select auth.uid()));

revoke all on public.spotlight_posts, public.spotlight_post_media, public.spotlight_media_assets from anon, authenticated;
grant select on public.spotlight_posts, public.spotlight_post_media, public.spotlight_media_assets to anon, authenticated;
grant insert on public.spotlight_media_assets to authenticated;

create or replace function public.submit_spotlight_post(
  p_title text,
  p_description text,
  p_media_ids text[] default null
)
returns public.spotlight_posts
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  created public.spotlight_posts;
  media text[] := '{}';
  media_key text;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  if p_media_ids is not null then
    select coalesce(array_agg(dedup.k order by dedup.ord), '{}') into media
      from (select lower(btrim(entry.k)) as k, min(entry.ord) as ord
              from unnest(p_media_ids) with ordinality as entry(k, ord)
             where entry.k is not null and btrim(entry.k) <> '' group by 1) dedup;
  end if;
  if coalesce(array_length(media, 1), 0) > 10 then raise exception 'একটি পোস্টে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়'; end if;
  foreach media_key in array media loop
    if media_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'ছবির তালিকায় অবৈধ ফাইল আইডি আছে'; end if;
    perform 1 from public.spotlight_media_assets m where m.id = media_key::uuid and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then raise exception 'যোগ করা ছবিগুলো আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি'; end if;
  end loop;
  insert into public.spotlight_posts (author_id, title, description)
    values (actor, trim(p_title), trim(p_description))
    returning * into created;
  insert into public.spotlight_post_media (post_id, media_id, position)
    select created.id, item.key::uuid, item.ord - 1 from unnest(media) with ordinality as item(key, ord);
  return created;
end;
$$;

-- The media Worker resolves a spotlight object through this gate rather than reading the private
-- R2 key table directly. Every spotlight post is public, so a picture attached to a post is
-- readable by anyone — including a signed-out visitor. An upload not yet attached stays private to
-- its owner (or the desk).
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
       or m.owner_id = (select auth.uid())
       or (select public.is_moderator_or_admin())
     )
$$;

revoke all on function public.submit_spotlight_post(text, text, text[]) from public, anon;
revoke all on function public.get_spotlight_media(uuid) from public;
grant execute on function public.submit_spotlight_post(text, text, text[]) to authenticated;
grant execute on function public.get_spotlight_media(uuid) to anon, authenticated;

commit;
