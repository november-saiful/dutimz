-- The front page's view counts, and the public counter behind them.
--
-- Two view systems, deliberately separate. `article_views` is the earning ledger: one row per
-- reader per article per Dhaka day, capped, salted-hashed and unreadable to the browser. What
-- the cards print is a plain page view: every beacon counts, whoever sends it and however often.
-- Earnings keep trusting the deduplicated row; the printed figure only says how often the story
-- was opened, so refreshing a page adds one.
--
-- The counter is stored per Dhaka day rather than as a single hot column, so the daily rows stay
-- small and a day can be aged out without touching an article row (and without waking the
-- `updated_at` triggers the archive relies on).
begin;

create table public.article_pageviews (
  article_id uuid not null references public.articles(id) on delete cascade,
  view_day date not null default (timezone('Asia/Dhaka', now())::date),
  views bigint not null default 0 check (views >= 0),
  primary key (article_id, view_day)
);

-- Nobody reads or writes this table directly; the two functions below are the whole interface.
alter table public.article_pageviews enable row level security;
revoke all on public.article_pageviews from public, anon, authenticated;

-- One page view, always. No reader identity is taken, so there is nothing to deduplicate and
-- nothing to cap; the `on conflict` makes simultaneous beacons add up instead of losing each
-- other. Only published stories exist to the counter, the same rule the beacon already follows.
create or replace function public.record_article_pageview(p_article_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  published boolean;
begin
  select true into published
    from public.articles
   where id = p_article_id and status = 'published';
  if published is null then return; end if;

  insert into public.article_pageviews (article_id, view_day, views)
  values (p_article_id, timezone('Asia/Dhaka', now())::date, 1)
  on conflict (article_id, view_day)
  do update set views = article_pageviews.views + 1;
end;
$$;

revoke all on function public.record_article_pageview(uuid) from public;
grant execute on function public.record_article_pageview(uuid) to anon, authenticated;

-- The page's own total, for every card at once.
create or replace function public.get_feed_view_summary(p_article_ids uuid[])
returns table (article_id uuid, views bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.article_id,
    sum(p.views)::bigint as views
  from public.article_pageviews p
  join public.articles a on a.id = p.article_id
  where p.article_id = any (p_article_ids)
    and a.status = 'published'
  group by p.article_id
$$;

revoke all on function public.get_feed_view_summary(uuid[]) from public;
grant execute on function public.get_feed_view_summary(uuid[]) to anon, authenticated;

commit;
