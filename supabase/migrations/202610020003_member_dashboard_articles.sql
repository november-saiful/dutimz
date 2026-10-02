-- A member's own news, in one call.
--
-- Row-level security already lets an author read their own articles whatever their status
-- (`articles_published_read`), including the ones written anonymously through an attribution
-- (`articles_attributed_author_read`). Reading them through one scoped function keeps the client
-- from having to express that union itself and keeps the shape stable as the article table grows.
--
-- Only the fields the dashboard shows are returned: the member's own story metadata, and, for a
-- rejection, the reason the desk recorded.
begin;

create or replace function public.get_my_articles()
returns table (
  id uuid,
  slug text,
  title text,
  status public.article_status,
  created_at timestamptz,
  published_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.slug, a.title, a.status,
         a.created_at, a.published_at, a.rejected_at, a.rejection_reason
    from public.articles a
   where a.author_id = (select auth.uid())
      or exists (select 1 from public.article_attributions aa
                  where aa.article_id = a.id and aa.author_id = (select auth.uid()))
   order by coalesce(a.published_at, a.created_at) desc
   limit 200
$$;

revoke all on function public.get_my_articles() from public, anon;
grant execute on function public.get_my_articles() to authenticated;

commit;
