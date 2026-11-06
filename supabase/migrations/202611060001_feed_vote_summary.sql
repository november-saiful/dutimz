-- The front page's vote counts, for every card at once.
--
-- The hero and the feed both print each story's up/down split. Asking `get_article_stats` once
-- per card would turn one cached render into twenty database round trips, and reading
-- `reactions` from the browser would hand the page every reader's row just to count them. One
-- aggregate answers the whole page instead. A story nobody has voted on is simply absent from
-- the result, and the caller reads that as (0, 0).
--
-- Only published stories are counted: an unpublished id in the request resolves to nothing, so
-- the function cannot be used to read the vote split of a story still waiting for the desk.
begin;

create or replace function public.get_feed_vote_summary(p_article_ids uuid[])
returns table (article_id uuid, upvotes bigint, downvotes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.article_id,
    count(*) filter (where r.reaction = 'up') as upvotes,
    count(*) filter (where r.reaction = 'down') as downvotes
  from public.reactions r
  join public.articles a on a.id = r.article_id
  where r.article_id = any (p_article_ids)
    and a.status = 'published'
  group by r.article_id
$$;

revoke all on function public.get_feed_vote_summary(uuid[]) from public;
grant execute on function public.get_feed_vote_summary(uuid[]) to anon, authenticated;

commit;
