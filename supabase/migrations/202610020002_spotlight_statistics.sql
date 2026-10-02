-- Public accountability for Spotlight.
--
-- An issue tracker whose numbers only the desk can see is not accountability. These two functions
-- are readable by anyone — signed in or not — and expose only aggregates: how many issues were
-- raised in a period and how many of them are settled, how many were called irrelevant, and which
-- body has solved the most. No post text, no author identity.
--
-- "Solved in a period" means the issues *raised* in that period whose current status is solved —
-- the resolution rate of that cohort — rather than solves that happened in the period, which
-- would credit the current week for an issue from last month.
begin;

create or replace function public.get_public_spotlight_stats()
returns jsonb
language sql stable security definer set search_path = '' as $$
  with bounds as (
    select date_trunc('week', now()) as week_start,
           date_trunc('month', now()) as month_start,
           date_trunc('year', now()) as year_start
  ),
  posts as (
    select issue_status, created_at from public.spotlight_posts
  ),
  window_counts as (
    select
      (select jsonb_build_object(
         'total', count(*),
         'solved', count(*) filter (where posts.issue_status = 'solved'),
         'invalid', count(*) filter (where posts.issue_status = 'invalid'))
       from posts, bounds where posts.created_at >= bounds.week_start) as week,
      (select jsonb_build_object(
         'total', count(*),
         'solved', count(*) filter (where posts.issue_status = 'solved'),
         'invalid', count(*) filter (where posts.issue_status = 'invalid'))
       from posts, bounds where posts.created_at >= bounds.month_start) as month,
      (select jsonb_build_object(
         'total', count(*),
         'solved', count(*) filter (where posts.issue_status = 'solved'),
         'invalid', count(*) filter (where posts.issue_status = 'invalid'))
       from posts, bounds where posts.created_at >= bounds.year_start) as year,
      (select jsonb_build_object(
         'total', count(*),
         'solved', count(*) filter (where posts.issue_status = 'solved'),
         'invalid', count(*) filter (where posts.issue_status = 'invalid'))
       from posts) as all_time
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'issues', (select count(*) from posts),
      'open', (select count(*) from posts where issue_status = 'open'),
      'in_progress', (select count(*) from posts where issue_status = 'in_progress'),
      'solved', (select count(*) from posts where issue_status = 'solved'),
      'invalid', (select count(*) from posts where issue_status = 'invalid')
    ),
    'false_count', (select count(*) from posts where issue_status = 'invalid'),
    'windows', jsonb_build_object(
      'week', week, 'month', month, 'year', year, 'all', all_time
    )
  )
  from window_counts
$$;

create or replace function public.get_public_spotlight_solvers(p_limit integer default 20)
returns table (solver_kind text, solver_name text, solved_count bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(e.solver_kind, 'other') as solver_kind,
         nullif(btrim(coalesce(e.solver_name, '')), '') as solver_name,
         count(distinct e.post_id) as solved_count
    from public.spotlight_issue_events e
   where e.to_status = 'solved'
   group by 1, 2
   order by solved_count desc, 1 asc, 2 asc nulls last
   limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;

revoke all on function public.get_public_spotlight_stats() from public;
grant execute on function public.get_public_spotlight_stats() to anon, authenticated;
revoke all on function public.get_public_spotlight_solvers(integer) from public;
grant execute on function public.get_public_spotlight_solvers(integer) to anon, authenticated;

commit;
