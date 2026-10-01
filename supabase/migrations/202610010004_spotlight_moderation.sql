-- Spotlight moderation.
--
-- An author can take their own post down; the desk can hide a post (a reversible, auditable
-- state) or remove it outright. Reading follows the same split: everyone sees visible posts,
-- an author also sees their own hidden ones, and the desk sees everything.
--
-- This migration also closes a leak the first Spotlight migration left open: the media table was
-- readable by anon, which exposed the private R2 object keys. The Worker resolves a picture
-- through get_spotlight_media, so no client ever needs to select that table.
begin;

alter table public.spotlight_posts add column if not exists status text not null default 'visible';
alter table public.spotlight_posts add constraint spotlight_posts_status_check
  check (status in ('visible', 'hidden'));

-- One permissive policy for everyone becomes three: visible to all, own to the author, all to
-- the desk. They are permissive, so a row is readable when any of them matches.
drop policy if exists spotlight_posts_public_read on public.spotlight_posts;
create policy spotlight_posts_visible_read on public.spotlight_posts for select to anon, authenticated
  using (status = 'visible');
create policy spotlight_posts_author_read on public.spotlight_posts for select to authenticated
  using (author_id = (select auth.uid()));
create policy spotlight_posts_desk_read on public.spotlight_posts for select to authenticated
  using ((select public.is_moderator_or_admin()));

-- The attachment rows stay public (they only carry ids and order), but the object keys do not.
drop policy if exists spotlight_media_public_read on public.spotlight_media_assets;
revoke select on public.spotlight_media_assets from anon, authenticated;

-- An author's own removal. The desk's removal shares the audited admin RPC below.
create or replace function public.delete_my_spotlight_post(p_post_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.spotlight_posts;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select * into target from public.spotlight_posts where id = p_post_id for update;
  if target.id is null then raise exception 'পোস্ট পাওয়া যায়নি'; end if;
  if target.author_id <> actor and not public.is_moderator_or_admin() then
    raise exception 'নিজের পোস্ট মুছে ফেলার অনুমতি প্রয়োজন' using errcode = '42501';
  end if;
  delete from public.spotlight_posts where id = p_post_id;
end;
$$;

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (
  action in ('approve_article', 'reject_article', 'hide_comment', 'remove_comment', 'restore_comment',
    'assign_role', 'review_application', 'review_withdrawal', 'edit_article', 'adjust_balance',
    'set_article_publication', 'moderate_spotlight')
);

-- One audited desk operation for the three things a member cannot decide about someone else's
-- post: hide it, restore it, or remove it.
create or replace function public.admin_set_spotlight_status(
  p_post_id uuid,
  p_decision text,
  p_reason text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.spotlight_posts;
begin
  if not public.is_moderator_or_admin() then raise exception 'মডারেটর অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if p_decision not in ('hide', 'restore', 'remove') then raise exception 'সিদ্ধান্ত সঠিক নয়'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'সিদ্ধান্তের কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  select * into target from public.spotlight_posts where id = p_post_id for update;
  if target.id is null then raise exception 'পোস্ট পাওয়া যায়নি'; end if;
  if p_decision = 'remove' then
    delete from public.spotlight_posts where id = p_post_id;
  else
    update public.spotlight_posts
       set status = case when p_decision = 'hide' then 'hidden' else 'visible' end
     where id = p_post_id;
  end if;
  insert into public.moderation_actions (actor_id, action, target_user_id, reason, details)
    values (actor, 'moderate_spotlight', target.author_id, trim(p_reason),
      jsonb_build_object('post_id', p_post_id, 'decision', p_decision, 'previous_status', target.status));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'moderate_spotlight', p_post_id, trim(p_reason),
      jsonb_build_object('decision', p_decision, 'author_id', target.author_id));
end;
$$;

revoke all on function public.delete_my_spotlight_post(uuid) from public, anon;
revoke all on function public.admin_set_spotlight_status(uuid, text, text) from public, anon;
grant execute on function public.delete_my_spotlight_post(uuid) to authenticated;
grant execute on function public.admin_set_spotlight_status(uuid, text, text) to authenticated;

commit;
