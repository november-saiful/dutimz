begin;

-- R2 object keys and private file metadata are never publicly selectable.
create table public.media_assets (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  original_key text not null unique check (char_length(original_key) between 1 and 512),
  derivative_key text unique check (derivative_key is null or char_length(derivative_key) <= 512),
  mime_type text not null check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    'application/pdf', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'video/mp4', 'video/webm'
  )),
  original_bytes bigint not null check (original_bytes between 1 and 41943040),
  derivative_bytes bigint check (derivative_bytes is null or (derivative_bytes > 0 and derivative_bytes < original_bytes)),
  created_at timestamptz not null default now()
);
alter table public.media_assets enable row level security;
create policy media_owner_or_article_read on public.media_assets for select to authenticated using (
  owner_id = (select auth.uid())
  or exists (
    select 1 from public.articles a
    where a.hero_media_key = public.media_assets.id::text and a.status = 'published'
  )
  or (select public.is_moderator_or_admin())
);
create policy media_editor_insert on public.media_assets for insert to authenticated with check (
  owner_id = (select auth.uid())
  and (select public.current_app_role()) in ('reporter', 'moderator', 'admin')
);
revoke all on public.media_assets from anon, authenticated;
grant select, insert on public.media_assets to authenticated;

-- A role/tier change cannot be made through a crafted profile-details update.
-- Writing withdrawal/payment decisions and earnings always goes through RPCs.
create or replace function public.search_public_articles(p_query text, p_limit integer default 30)
returns table (
  id uuid,
  slug text,
  title text,
  excerpt text,
  body text,
  status public.article_status,
  author_id uuid,
  hero_media_key text,
  published_at timestamptz,
  created_at timestamptz,
  category jsonb,
  profiles jsonb
)
language sql stable security invoker
set search_path = ''
as $$
  with terms as (
    select nullif(trim(coalesce(p_query, '')), '') as q
  )
  select a.id, a.slug, a.title, a.excerpt, a.body, a.status, a.author_id, a.hero_media_key,
         a.published_at, a.created_at,
         jsonb_build_object('slug', c.slug, 'title_bn', c.title_bn) as category,
         jsonb_build_object('username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url) as profiles
  from public.articles a
  join public.categories c on c.id = a.category_id
  join public.profiles p on p.id = a.author_id
  cross join terms
  where a.status = 'published'
    and terms.q is not null
    and a.search_document @@ plainto_tsquery('simple', terms.q)
  order by ts_rank(a.search_document, plainto_tsquery('simple', terms.q)) desc, a.published_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 50))
$$;

revoke all on function public.search_public_articles(text, integer) from public;
grant execute on function public.search_public_articles(text, integer) to anon, authenticated;

-- Do not hand readers row access to identity-bearing reporter applications.
revoke all on public.reporter_applications from anon, authenticated;
grant select on public.reporter_applications to authenticated;
grant insert (applicant_id, motivation) on public.reporter_applications to authenticated;

-- Protect stable author id/role fields; direct profile editing is limited to the
-- public profile fields. PostgREST row column grants do not make owner ids writable.
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, bio) on public.profiles to authenticated;

-- Supabase role/application/finance tables must not be modified via direct API writes.
revoke insert, update, delete, truncate, references, trigger on public.user_roles from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.earnings_ledger from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.withdrawals from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.moderation_actions from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.admin_audit_log from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.article_revisions from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.articles from anon, authenticated;

commit;
