-- Anonymous topic preferences + unsubscribe for web push.
-- Tokens are long random values: delete policies only match the exact token
-- the client sends, so one visitor cannot enumerate or wipe others' rows.

-- Anonymous visitors can record their own topic choices (user_id stays null).
drop policy if exists "Anyone can insert topic pref" on public.push_topic_prefs;
create policy "Anyone can insert topic pref" on public.push_topic_prefs
  for insert to anon with check (user_id is null);

-- Anonymous visitors can replace their own topic choices.
drop policy if exists "Anyone can delete own topic pref" on public.push_topic_prefs;
create policy "Anyone can delete own topic pref" on public.push_topic_prefs
  for delete to anon using (user_id is null);

-- Anonymous visitors can remove their own device token (unsubscribe).
drop policy if exists "Anyone can delete own push subscription" on public.push_subscriptions;
create policy "Anyone can delete own push subscription" on public.push_subscriptions
  for delete to anon using (user_id is null);
