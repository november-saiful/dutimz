begin;

-- Every story can carry an ordered gallery of photographs. Rows are written only
-- by the submit_article SECURITY DEFINER below — clients get no write grant — and
-- a reader only ever sees the gallery rows of a published story. The media objects
-- themselves stay in R2 behind the media worker; this table records which of them
-- belong to a story and in what order.
create table public.article_media (
  article_id uuid not null references public.articles(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete cascade,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (article_id, media_id),
  unique (article_id, position)
);

alter table public.article_media enable row level security;

create policy article_media_story_read on public.article_media for select to anon, authenticated
  using (exists (
    select 1 from public.articles a
    where a.id = article_id
      and (a.status = 'published' or a.author_id = (select auth.uid()) or (select public.is_moderator_or_admin()))
  ));

revoke all on public.article_media from anon, authenticated;
grant select on public.article_media to anon, authenticated;

-- The R2 object of a gallery image becomes readable exactly when its story is
-- published: the serving gate and the direct table policy both learn the new
-- attachment relation alongside the existing hero_media_key check.
create or replace function public.get_media_asset(p_media_id uuid)
returns table (
  id uuid,
  owner_id uuid,
  original_key text,
  derivative_key text,
  mime_type text,
  original_bytes bigint,
  derivative_bytes bigint,
  is_public boolean
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.owner_id, m.original_key, m.derivative_key, m.mime_type,
         m.original_bytes, m.derivative_bytes,
         exists (
           select 1 from public.articles a
            where a.status = 'published'
              and (a.hero_media_key = m.id::text
                   or exists (select 1 from public.article_media am
                               where am.article_id = a.id and am.media_id = m.id))
         ) as is_public
    from public.media_assets m
   where m.id = p_media_id
     and (
       m.owner_id = (select auth.uid())
       or (select public.is_moderator_or_admin())
       or exists (
         select 1 from public.articles a
          where a.status = 'published'
            and (a.hero_media_key = m.id::text
                 or exists (select 1 from public.article_media am
                             where am.article_id = a.id and am.media_id = m.id))
       )
     )
$$;

drop policy media_owner_or_article_read on public.media_assets;
create policy media_owner_or_article_read on public.media_assets for select to authenticated using (
  owner_id = (select auth.uid())
  or exists (
    select 1 from public.articles a
    where a.status = 'published'
      and (a.hero_media_key = public.media_assets.id::text
           or exists (select 1 from public.article_media am
                       where am.article_id = a.id and am.media_id = public.media_assets.id))
  )
  or (select public.is_moderator_or_admin())
);

-- submit_article gains an ordered gallery list. The signature gains a parameter,
-- so — as in migration 005 — the old function is dropped and a new one created:
-- every parameter still has a default, so a client bundle built before this
-- migration keeps submitting unchanged in the window between migration and deploy.
drop function public.submit_article(text, text, text, text, text, text);

create or replace function public.submit_article(
  p_category_slug text,
  p_title text,
  p_excerpt text,
  p_body text,
  p_hero_media_key text default null,
  -- Deprecated and ignored: reporters never supply a slug. Accepted only so a
  -- client built before this migration keeps submitting until it is replaced.
  p_slug text default null,
  -- Ordered R2 media ids for the story gallery; the first entry doubles as the cover.
  p_media_keys text[] default null
)
returns public.articles
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_role public.app_role;
  actor_tier public.reporter_tier;
  category uuid;
  created public.articles;
  attempt integer := 0;
  gallery text[] := '{}';
  hero_text text;
  gkey text;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select role, reporter_tier into actor_role, actor_tier from public.user_roles where user_id = actor;
  if actor_role not in ('reporter', 'moderator', 'admin') then raise exception 'প্রতিবেদন জমা দিতে রিপোর্টার অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  select id into category from public.categories where slug = p_category_slug and active;
  if category is null then raise exception 'সংবাদ বিভাগ পাওয়া যায়নি'; end if;

  -- The editor sends the gallery as media ids. De-duplicate while keeping the
  -- first position, cap the count, and accept only image objects the submitting
  -- author uploaded themselves: a crafted payload can neither reach another
  -- author's private upload nor pin non-image files to a published story.
  if p_media_keys is not null then
    select coalesce(array_agg(dedup.k order by dedup.ord), '{}') into gallery
      from (
        select lower(btrim(entry.k)) as k, min(entry.ord) as ord
          from unnest(p_media_keys) with ordinality as entry(k, ord)
         where entry.k is not null and btrim(entry.k) <> ''
         group by 1
      ) dedup;
  end if;
  if coalesce(array_length(gallery, 1), 0) > 10 then
    raise exception 'একটি প্রতিবেদনে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;
  foreach gkey in array gallery loop
    if gkey !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'ছবির তালিকায় অবৈধ ফাইল আইডি আছে';
    end if;
    perform 1 from public.media_assets m
     where m.id = gkey::uuid and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then
      raise exception 'যোগ করা ছবিগুলো আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি';
    end if;
  end loop;
  hero_text := nullif(trim(coalesce(p_hero_media_key, '')), '');
  if hero_text is not null then
    if hero_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'প্রচ্ছদের ছবির আইডি সঠিক নয়';
    end if;
    perform 1 from public.media_assets m
     where m.id = hero_text::uuid and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then
      raise exception 'প্রচ্ছদের ছবিটি পাওয়া যায়নি বা আপনার আপলোড করা নয়';
    end if;
  end if;

  -- Two reporters can submit the same headline at the same moment; the unique
  -- index is the real arbiter, so retry inside a subtransaction on conflict.
  loop
    attempt := attempt + 1;
    begin
      insert into public.articles (author_id, category_id, slug, title, excerpt, body, hero_media_key, status, published_at)
        values (
          actor, category, public.allocate_article_slug(p_title), trim(p_title), trim(p_excerpt), trim(p_body), hero_text,
          case when actor_role = 'reporter' and actor_tier = 'junior' then 'pending'::public.article_status else 'published'::public.article_status end,
          case when actor_role = 'reporter' and actor_tier = 'junior' then null else now() end
        ) returning * into created;
      exit;
    exception when unique_violation then
      if attempt >= 4 then raise; end if;
    end;
  end loop;

  insert into public.article_media (article_id, media_id, position)
  select created.id, item.key::uuid, item.ord - 1
    from unnest(gallery) with ordinality as item(key, ord);

  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (created.id, actor, 1, created.title, created.excerpt, created.body, 'প্রাথমিক জমা');
  if created.status = 'published' then perform public.add_article_earning(created.id, actor); end if;
  return created;
end;
$$;

revoke all on function public.submit_article(text, text, text, text, text, text, text[]) from public, anon;
grant execute on function public.submit_article(text, text, text, text, text, text, text[]) to authenticated;

commit;
