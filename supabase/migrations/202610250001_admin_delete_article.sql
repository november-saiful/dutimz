-- Permanent deletion of a story.
--
-- The panel could only ever withhold a story: `admin_set_article_status` moves it to `rejected`,
-- which keeps the row so it can be restored. Spam, a duplicated submission, or a test that was
-- never meant to be published had no way out of the archive, and the desk was left with rows it
-- could not get rid of.
--
-- This adds the one door. It is administrator-only, it needs a reason like every other desk
-- decision, and it writes the story's identity to `admin_audit_log` *before* the row disappears —
-- the log's target is a plain uuid with no foreign key, so the record outlives what it describes.
--
-- One story is deliberately not deletable: a story that has been paid. `earnings_ledger.article_id`
-- is `on delete restrict` because the ledger is the author's proof of what they earned, and a
-- deleted story would take that proof with it. Such a story can still be withheld.
begin;

create or replace function public.admin_delete_article(
  p_article_id uuid,
  p_reason text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  owner_id uuid;
  removed jsonb;
begin
  if not public.is_admin() then
    raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'মুছে ফেলার কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then
    raise exception 'প্রতিবেদন পাওয়া যায়নি';
  end if;
  -- The author is resolved the same way every other desk decision resolves it, so an anonymous
  -- story is still accounted for after its attribution row cascades away.
  owner_id := coalesce(target.author_id,
    (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  if exists (select 1 from public.earnings_ledger l where l.article_id = p_article_id) then
    raise exception 'এই প্রতিবেদনে অর্থ নির্ধারিত হয়েছে; অর্থের হিসাব রক্ষার জন্য এটি স্থায়ীভাবে মুছে ফেলা যায় না — প্রকাশ থেকে সরিয়ে রাখুন';
  end if;
  -- Everything the story was, copied out while the row still exists. The counts say what the
  -- cascade is about to take with it, so the log answers "what did we lose" later on.
  removed := jsonb_build_object(
    'title', target.title,
    'slug', target.slug,
    'status', target.status::text,
    'author_id', owner_id,
    'is_anonymous', target.is_anonymous,
    'published_at', target.published_at,
    'created_at', target.created_at,
    'comments', (select count(*) from public.comments c where c.article_id = p_article_id),
    'reactions', (select count(*) from public.reactions r where r.article_id = p_article_id),
    'bookmarks', (select count(*) from public.bookmarks b where b.article_id = p_article_id),
    'media', (select count(*) from public.article_media m where m.article_id = p_article_id),
    'revisions', (select count(*) from public.article_revisions v where v.article_id = p_article_id)
  );
  -- `moderation_actions.article_id` is `on delete set null`, and the table insists every row still
  -- names a target. A row that only ever named the story keeps its history by naming its author.
  update public.moderation_actions ma
     set target_user_id = owner_id
   where ma.article_id = p_article_id
     and ma.target_user_id is null
     and owner_id is not null;
  delete from public.moderation_actions ma
   where ma.article_id = p_article_id
     and ma.target_user_id is null;
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'delete_article', p_article_id, trim(p_reason), removed);
  delete from public.articles where id = p_article_id;
end;
$$;
revoke all on function public.admin_delete_article(uuid, text) from public, anon;
grant execute on function public.admin_delete_article(uuid, text) to authenticated;

commit;
