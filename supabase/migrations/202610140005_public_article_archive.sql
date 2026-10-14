-- The search page doubles as the site's archive: an empty query lists the
-- newest published reports instead of an empty form. `search_public_articles`
-- only matches a non-empty full-text query, so this sibling returns the same
-- row shape newest-first with offset paging for the "load more" affordance.
begin;

create or replace function public.list_public_articles(p_limit integer default 30, p_offset integer default 0, p_category_slug text default null)
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
  is_anonymous boolean,
  category jsonb,
  profiles jsonb
)
language sql stable security invoker
set search_path = ''
as $$
  select a.id, a.slug, a.title, a.excerpt, a.body, a.status, a.author_id, a.hero_media_key,
         a.published_at, a.created_at, a.is_anonymous,
         jsonb_build_object('slug', c.slug, 'title_bn', c.title_bn) as category,
         case when p.id is null then null
              else jsonb_build_object('username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url) end as profiles
  from public.articles a
  join public.categories c on c.id = a.category_id
  left join public.profiles p on p.id = a.author_id
  where a.status = 'published'
    and (p_category_slug is null or c.slug = p_category_slug)
  order by a.published_at desc nulls last, a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 50))
  offset greatest(0, coalesce(p_offset, 0))
$$;

revoke all on function public.list_public_articles(integer, integer, text) from public;
grant execute on function public.list_public_articles(integer, integer, text) to anon, authenticated;

commit;
