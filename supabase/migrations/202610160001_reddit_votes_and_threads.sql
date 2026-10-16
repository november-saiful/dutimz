-- Reddit-style voting and threaded comments.
--
-- Articles move from the `like` / `insightful` / `support` reaction set to a
-- single up/down vote per reader, and comments gain threaded replies plus
-- per-comment votes. Legacy reactions are folded into `up` so existing counts
-- survive as upvotes; no published count drops through this migration.
begin;

-- 1. Reactions become votes. The old check only allowed the legacy set, so it
-- is dropped first and re-added for the vote set after the backfill.
alter table public.reactions drop constraint if exists reactions_reaction_check;

-- `like` maps straight onto `up`.
update public.reactions set reaction = 'up' where reaction = 'like';

-- A reader who left both a `like` and an `insightful`/`support` would collide
-- on the primary key once everything becomes `up`; keep their `up`.
delete from public.reactions
where reaction in ('insightful', 'support')
  and exists (
    select 1 from public.reactions r2
    where r2.article_id = reactions.article_id
      and r2.user_id = reactions.user_id
      and r2.reaction = 'up'
  );

-- Remaining legacy reactions become upvotes rather than disappearing.
update public.reactions set reaction = 'up' where reaction in ('insightful', 'support');

alter table public.reactions
  add constraint reactions_reaction_check check (reaction in ('up', 'down'));

-- One vote per reader per article: the primary key still includes the reaction,
-- so without this a reader could hold both an `up` and a `down`.
create unique index if not exists reactions_one_vote_per_user
  on public.reactions (article_id, user_id);

-- 2. Threaded comments: a null parent is a top-level comment, otherwise a reply.
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_parent_idx
  on public.comments (parent_id) where parent_id is not null;

-- A reply must belong to the same article as its parent, and a comment can
-- never be its own parent. Depth itself is unbounded, like Reddit.
create or replace function public.validate_comment_parent()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  parent_article uuid;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then raise exception 'মন্তব্যের জবাব একই মন্তব্য হতে পারে না'; end if;
  select article_id into parent_article from public.comments where id = new.parent_id;
  if parent_article is null then raise exception 'যে মন্তব্যের জবাব দিচ্ছেন সেটি পাওয়া যায়নি'; end if;
  if parent_article <> new.article_id then raise exception 'যে মন্তব্যের জবাব দিচ্ছেন সেটি এই প্রতিবেদনের নয়'; end if;
  return new;
end;
$$;

drop trigger if exists comments_validate_parent on public.comments;
create trigger comments_validate_parent
  before insert or update of parent_id, article_id on public.comments
  for each row execute function public.validate_comment_parent();

revoke all on function public.validate_comment_parent() from public, anon, authenticated;

-- 3. Per-comment votes. Readers see only aggregates (via the RPC below) plus
-- their own votes; the table itself never exposes who else voted what.
create table if not exists public.comment_votes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  value smallint not null check (value in (1, -1)),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_votes enable row level security;

drop policy if exists comment_votes_owner_read on public.comment_votes;
create policy comment_votes_owner_read on public.comment_votes for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists comment_votes_owner_insert on public.comment_votes;
create policy comment_votes_owner_insert on public.comment_votes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and value in (1, -1)
    and exists (
      select 1 from public.comments c
      join public.articles a on a.id = c.article_id
      where c.id = comment_id and c.status = 'visible' and a.status = 'published'
    )
  );

drop policy if exists comment_votes_owner_update on public.comment_votes;
create policy comment_votes_owner_update on public.comment_votes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and value in (1, -1));

drop policy if exists comment_votes_owner_delete on public.comment_votes;
create policy comment_votes_owner_delete on public.comment_votes for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.comment_votes from anon, authenticated;
grant select on public.comment_votes to authenticated;
grant insert, update, delete on public.comment_votes to authenticated;

-- 4. Article stats now report the vote split. `likes` is kept as an alias for
-- `upvotes` so older clients keep working.
create or replace function public.get_article_stats(p_article_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'likes', (select count(*) from public.reactions r where r.article_id = p_article_id and r.reaction = 'up'),
    'upvotes', (select count(*) from public.reactions r where r.article_id = p_article_id and r.reaction = 'up'),
    'downvotes', (select count(*) from public.reactions r where r.article_id = p_article_id and r.reaction = 'down'),
    'score', (select count(*) filter (where r.reaction = 'up') - count(*) filter (where r.reaction = 'down') from public.reactions r where r.article_id = p_article_id),
    'comments', (select count(*) from public.comments c where c.article_id = p_article_id and c.status = 'visible')
  )
  where exists (select 1 from public.articles a where a.id = p_article_id and a.status = 'published')
$$;

-- 5. Public per-comment scores for one article: no user ids, just aggregates.
create or replace function public.get_comment_scores(p_article_id uuid)
returns table (comment_id uuid, upvotes bigint, downvotes bigint, score bigint)
language sql stable security definer set search_path = '' as $$
  select c.id as comment_id,
         count(v.*) filter (where v.value = 1) as upvotes,
         count(v.*) filter (where v.value = -1) as downvotes,
         coalesce(sum(v.value), 0) as score
  from public.comments c
  left join public.comment_votes v on v.comment_id = c.id
  where c.article_id = p_article_id
    and c.status = 'visible'
    and exists (select 1 from public.articles a where a.id = p_article_id and a.status = 'published')
  group by c.id
$$;

revoke all on function public.get_comment_scores(uuid) from public;
grant execute on function public.get_comment_scores(uuid) to anon, authenticated;

commit;
