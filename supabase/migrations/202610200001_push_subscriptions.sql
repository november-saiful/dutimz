-- Push notification subscriptions (FCM web push, 100% free tier).
-- FCM tokens are secrets: never expose via SELECT to other users.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  token text unique not null,
  user_agent text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.push_topic_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  token text not null,
  topic text not null,
  created_at timestamptz default now(),
  unique (token, topic)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_topic_prefs enable row level security;

-- Logged-in users manage only their own rows
drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users manage own topic prefs" on public.push_topic_prefs;
create policy "Users manage own topic prefs" on public.push_topic_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Anonymous visitors: allow INSERT only (no SELECT/UPDATE/DELETE),
-- so a logged-out reader can subscribe without reading others' tokens.
drop policy if exists "Anyone can insert push subscription" on public.push_subscriptions;
create policy "Anyone can insert push subscription" on public.push_subscriptions
  for insert to anon with check (user_id is null);

create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions(user_id, updated_at desc);
create index if not exists idx_push_topic_prefs_topic
  on public.push_topic_prefs(topic, created_at desc);
