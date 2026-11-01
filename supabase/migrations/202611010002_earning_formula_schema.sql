-- The automatic earning system's data layer.
--
-- Money becomes fractional (`numeric(12,2)` — view income arrives in 0.2 TK steps), the ledger
-- gains a machine-readable `details` breakdown for every formula award, and view income gets its
-- own two entry types plus a per-day `view_day` stamp. A new `article_views` table deduplicates
-- readers; a self-referencing `released_from` column lets each held row be released exactly once
-- (the old `one_profile_release_per_article` index could not tell an article's held fee from its
-- view income, and hourly view settlements can create several held rows per article).
begin;

-- The crime desk. It drives a formula bonus, but it is an ordinary category everywhere else.
insert into public.categories (slug, title_bn, description_bn, sort_order) values
  ('crime', 'অপরাধ', 'ক্যাম্পাস ও আশেপাশের অপরাধের সংবাদ', 7)
on conflict (slug) do nothing;

-- One row per reader per article per Dhaka day. `viewer_hash` is the only identity kept — no IP
-- or token is stored. Rows are written solely through the security-definer RPC; nobody else can
-- read or write the table.
create table public.article_views (
  id bigint generated always as identity primary key,
  article_id uuid not null references public.articles(id) on delete cascade,
  viewer_hash text not null check (char_length(viewer_hash) = 32),
  view_day date not null default (timezone('Asia/Dhaka', now())::date),
  settled boolean not null default false,
  unique (article_id, viewer_hash, view_day)
);
create index article_views_unsettled_idx on public.article_views (view_day) where not settled;
alter table public.article_views enable row level security;
revoke all on public.article_views from public, anon, authenticated;

alter table public.earnings_ledger
  add column details jsonb not null default '{}'::jsonb,
  add column view_day date,
  add column released_from uuid references public.earnings_ledger(id);

-- Fractional money. The `<> 0` check travels with the column; whole-TK history casts losslessly.
alter table public.earnings_ledger alter column amount_tk type numeric(12,2);

-- The article-reference rule learns the view types (which must name their day) and demands that a
-- release names the held row it releases. Everything else in the ledger still carries no article.
alter table public.earnings_ledger drop constraint if exists ledger_article_reference;
alter table public.earnings_ledger add constraint ledger_article_reference check (
  (entry_type in ('article_earning_available', 'article_earning_held',
                  'view_earning_available', 'view_earning_held')
    and article_id is not null and withdrawal_id is null and amount_tk > 0)
  or (entry_type = 'profile_release'
    and article_id is not null and withdrawal_id is null and amount_tk > 0 and released_from is not null)
  or (entry_type not in ('article_earning_available', 'article_earning_held',
                         'view_earning_available', 'view_earning_held', 'profile_release')
    and article_id is null)
);
alter table public.earnings_ledger drop constraint if exists ledger_view_day_scope;
alter table public.earnings_ledger add constraint ledger_view_day_scope check (
  (entry_type in ('view_earning_available', 'view_earning_held') and view_day is not null)
  or (entry_type not in ('view_earning_available', 'view_earning_held') and view_day is null)
);

-- Releases are now keyed by the held row they settle, not by article: an article can hold both a
-- formula fee and any number of view batches, each released once.
drop index if exists public.one_profile_release_per_article;
create unique index one_profile_release_per_held_row
  on public.earnings_ledger (released_from) where entry_type = 'profile_release';

create or replace function public.release_held_earnings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.profile_completion_for(new.user_id) = 100 then
    insert into public.earnings_ledger (
      user_id, article_id, entry_type, amount_tk, reporter_tier_snapshot, released_from
    )
    select held.user_id, held.article_id, 'profile_release', held.amount_tk,
           held.reporter_tier_snapshot, held.id
      from public.earnings_ledger held
     where held.user_id = new.user_id
       and held.entry_type in ('article_earning_held', 'view_earning_held')
       and not exists (
         select 1 from public.earnings_ledger released
          where released.released_from = held.id
            and released.entry_type = 'profile_release'
       )
    on conflict (released_from) where entry_type = 'profile_release' do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.release_held_earnings_on_identity_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.profile_completion_for(new.id) = 100 then
    insert into public.earnings_ledger (
      user_id, article_id, entry_type, amount_tk, reporter_tier_snapshot, released_from
    )
    select held.user_id, held.article_id, 'profile_release', held.amount_tk,
           held.reporter_tier_snapshot, held.id
      from public.earnings_ledger held
     where held.user_id = new.id
       and held.entry_type in ('article_earning_held', 'view_earning_held')
       and not exists (
         select 1 from public.earnings_ledger released
          where released.released_from = held.id
            and released.entry_type = 'profile_release'
       )
    on conflict (released_from) where entry_type = 'profile_release' do nothing;
  end if;
  return new;
end;
$$;

commit;
