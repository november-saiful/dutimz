-- An author copies the link to their own story before it is published, and can open that link to
-- review it. The public news route serves a published article to everyone; an unpublished one is
-- served only to its author or the desk, and only through these two functions.
--
-- `article_slug_exists` exposes nothing but the fact that a slug is taken, so the route can still
-- answer a genuine 404 for a slug that never existed while rendering a gated preview for one that
-- is merely unpublished. `get_my_article_by_slug` is where the body is actually read, and it
-- returns nothing at all to anyone who is not the author or a moderator/admin.
begin;

create or replace function public.article_slug_exists(p_slug text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.articles a where a.slug = p_slug)
$$;

create or replace function public.get_my_article_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  excerpt text,
  body text,
  status public.article_status,
  hero_media_key text,
  published_at timestamptz,
  created_at timestamptz,
  is_anonymous boolean,
  category_slug text,
  category_title text,
  media jsonb
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.slug, a.title, a.excerpt, a.body, a.status, a.hero_media_key,
         a.published_at, a.created_at, a.is_anonymous,
         c.slug, c.title_bn,
         coalesce(
           (select jsonb_agg(jsonb_build_object('media_id', am.media_id, 'position', am.position)
                              order by am.position)
              from public.article_media am where am.article_id = a.id),
           '[]'::jsonb)
    from public.articles a
    left join public.categories c on c.id = a.category_id
   where a.slug = p_slug
     and (
       a.author_id = (select auth.uid())
       or exists (
         select 1 from public.article_attributions at
          where at.article_id = a.id and at.author_id = (select auth.uid())
       )
       or (select public.is_moderator_or_admin())
     )
   limit 1
$$;

revoke all on function public.article_slug_exists(text) from public;
grant execute on function public.article_slug_exists(text) to anon, authenticated;

revoke all on function public.get_my_article_by_slug(text) from public, anon;
grant execute on function public.get_my_article_by_slug(text) to authenticated;

commit;
