-- Admin date control for Spotlight posts.
--
-- News already re-dates through admin_set_article_publication; Spotlight had no
-- equivalent, so the desk could hide or remove a post but never correct its
-- dateline. This adds one audited admin operation that moves created_at, clamped
-- to now() like the article dateline, and logs it in both audit tables.
begin;

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (
  action in ('approve_article', 'reject_article', 'hide_comment', 'remove_comment', 'restore_comment',
    'assign_role', 'review_application', 'review_withdrawal', 'edit_article', 'adjust_balance',
    'set_article_publication', 'moderate_spotlight', 'set_article_status', 'resolve_spotlight',
    'approve_article_edit', 'reject_article_edit',
    'approve_spotlight_edit', 'reject_spotlight_edit',
    'set_spotlight_date')
);

create or replace function public.admin_set_spotlight_date(
  p_post_id uuid,
  p_created_at timestamptz,
  p_reason text
)
returns public.spotlight_posts
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.spotlight_posts;
  result public.spotlight_posts;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if p_created_at is null then raise exception 'তারিখ নির্ধারণ করুন'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'পরিবর্তনের কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  select * into target from public.spotlight_posts where id = p_post_id for update;
  if target.id is null then raise exception 'পোস্ট পাওয়া যায়নি'; end if;
  update public.spotlight_posts
     set created_at = least(p_created_at, now())
   where id = p_post_id
   returning * into result;
  insert into public.moderation_actions (actor_id, action, target_user_id, reason, details)
    values (actor, 'set_spotlight_date', target.author_id, trim(p_reason),
      jsonb_build_object('post_id', p_post_id,
                         'previous_created_at', target.created_at,
                         'created_at', result.created_at));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'set_spotlight_date', p_post_id, trim(p_reason),
      jsonb_build_object('previous_created_at', target.created_at,
                         'created_at', result.created_at,
                         'author_id', target.author_id));
  return result;
end;
$$;

revoke all on function public.admin_set_spotlight_date(uuid, timestamptz, text) from public, anon;
grant execute on function public.admin_set_spotlight_date(uuid, timestamptz, text) to authenticated;

commit;
