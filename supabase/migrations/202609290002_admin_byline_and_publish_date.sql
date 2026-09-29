-- Desk control over who a story is bylined to, and when it is dated.
--
-- Until now the author was always whoever pressed submit and the publication timestamp was
-- always now(). A desk needs both knobs, but each one rewrites a fact about an article --
-- who wrote it, and when it appeared -- so both stay behind is_admin(). A reporter keeps
-- filing as themselves and never sees the controls at all; a reporter who sends the fields
-- anyway is refused rather than quietly ignored, because a byline that silently did not
-- change is worse than an error.
begin;

-- The submission gains the two desk-only fields. Both default to null, so every existing
-- caller keeps its old meaning: no author means "me", no date means "when it goes live".
drop function if exists public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean);

create or replace function public.submit_article(
  p_category_slug text,
  p_title text,
  p_excerpt text,
  p_body text,
  p_hero_media_key text default null,
  p_slug text default null,
  p_media_keys text[] default null,
  p_questionnaire_answers jsonb default '{}'::jsonb,
  p_questionnaire_version_id uuid default null,
  p_is_anonymous boolean default false,
  p_author_id uuid default null,
  p_published_at timestamptz default null
)
returns public.articles
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_role public.app_role;
  actor_tier public.reporter_tier;
  category uuid;
  created public.articles;
  attempt integer := 0;
  gallery text[] := '{}';
  hero_text text;
  gkey text;
  questionnaire_id uuid;
  validated_answers jsonb;
  normalized_media_key text;
  anonymous boolean := coalesce(p_is_anonymous, false);
  owner uuid;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select role, reporter_tier into actor_role, actor_tier from public.user_roles where user_id = actor;
  if actor_role not in ('reporter', 'moderator', 'admin') then raise exception 'প্রতিবেদন জমা দিতে রিপোর্টার অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if (p_author_id is not null or p_published_at is not null) and not public.is_admin() then
    raise exception 'লেখক নির্বাচন ও প্রকাশের সময় নির্ধারণ কেবল নির্বাহী করতে পারেন' using errcode = '42501';
  end if;
  -- Filing on someone else's behalf still has to resolve to a real profile, and the story
  -- belongs to that author from here on: the byline, the attribution and the fee all follow
  -- the named reporter rather than the desk account that pressed publish.
  owner := coalesce(p_author_id, actor);
  if p_author_id is not null then
    perform 1 from public.profiles where id = p_author_id;
    if not found then raise exception 'নির্বাচিত লেখকের প্রোফাইল পাওয়া যায়নি'; end if;
  end if;
  select id into category from public.categories where slug = p_category_slug and active;
  if category is null then raise exception 'সংবাদ বিভাগ পাওয়া যায়নি'; end if;
  perform pg_advisory_xact_lock(hashtext('article_questionnaire_version'));
  select q.id into questionnaire_id from public.article_questionnaire_versions q where q.active;
  if questionnaire_id is null then raise exception 'প্রশ্নমালা এখনো প্রস্তুত নয়'; end if;
  if p_questionnaire_version_id is not null and p_questionnaire_version_id <> questionnaire_id then raise exception 'প্রশ্নমালা হালনাগাদ হয়েছে; পাতা রিফ্রেশ করে আবার চেষ্টা করুন'; end if;
  validated_answers := public.validate_article_questionnaire_answers(questionnaire_id, coalesce(p_questionnaire_answers, '{}'::jsonb));

  if p_media_keys is not null then
    select coalesce(array_agg(dedup.k order by dedup.ord), '{}') into gallery
      from (select lower(btrim(entry.k)) as k, min(entry.ord) as ord from unnest(p_media_keys) with ordinality as entry(k, ord)
            where entry.k is not null and btrim(entry.k) <> '' group by 1) dedup;
  end if;
  if coalesce(array_length(gallery, 1), 0) > 10 then raise exception 'একটি প্রতিবেদনে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়'; end if;
  hero_text := nullif(trim(coalesce(p_hero_media_key, '')), '');
  if hero_text is not null and coalesce(array_length(gallery, 1), 0) > 0 then
    select value into normalized_media_key from unnest(gallery) as key_list(value) where value = hero_text;
    if normalized_media_key is null then raise exception 'প্রচ্ছদের ছবি গ্যালারির অংশ হতে হবে'; end if;
  end if;
  foreach gkey in array gallery loop
    if gkey !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'ছবির তালিকায় অবৈধ ফাইল আইডি আছে'; end if;
    perform 1 from public.media_assets m where m.id = gkey::uuid and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then raise exception 'যোগ করা ছবিগুলো আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি'; end if;
  end loop;
  if hero_text is not null then
    if hero_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'প্রচ্ছদের ছবির আইডি সঠিক নয়'; end if;
    perform 1 from public.media_assets m where m.id = hero_text::uuid and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then raise exception 'প্রচ্ছদের ছবিটি পাওয়া যায়নি বা আপনার আপলোড করা নয়'; end if;
  end if;
  loop
    attempt := attempt + 1;
    begin
      insert into public.articles (author_id, category_id, slug, title, excerpt, body, hero_media_key, status, published_at, is_anonymous)
      values (case when anonymous then null else owner end, category, public.allocate_article_slug(p_title), trim(p_title), trim(p_excerpt), trim(p_body), hero_text,
        case when actor_role = 'reporter' and actor_tier = 'junior' then 'pending'::public.article_status else 'published'::public.article_status end,
        -- A backdated dateline is kept as chosen; a date ahead of now is capped, so the stamp
        -- on the story is never later than the moment it actually went live.
        case when actor_role = 'reporter' and actor_tier = 'junior' then null else least(coalesce(p_published_at, now()), now()) end,
        anonymous) returning * into created;
      exit;
    exception when unique_violation then
      if attempt >= 4 then raise; end if;
    end;
  end loop;
  insert into public.article_media (article_id, media_id, position) select created.id, item.key::uuid, item.ord - 1 from unnest(gallery) with ordinality as item(key, ord);
  insert into public.article_questionnaire_responses(article_id, questionnaire_version_id, answers) values (created.id, questionnaire_id, validated_answers);
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason) values (created.id, actor, 1, created.title, created.excerpt, created.body, 'প্রাথমিক জমা');
  if anonymous then
    insert into public.article_attributions (article_id, author_id) values (created.id, owner);
    insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
      values (actor, 'submit_anonymous_article', created.id, 'নাম প্রকাশে অনিচ্ছুক', jsonb_build_object('title', created.title, 'status', created.status));
  end if;
  -- Publishing under another person's name is an identity decision, so it is recorded on its
  -- own even when the byline itself is public and the ledger already names the author.
  if owner <> actor then
    insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
      values (actor, 'publish_on_behalf', created.id, 'লেখকের নামে প্রকাশ',
        jsonb_build_object('author_id', owner, 'anonymous', anonymous, 'published_at', created.published_at));
  end if;
  -- The fee follows the reporter, not the byline, so an anonymous story still pays out.
  if created.status = 'published' then perform public.add_article_earning(created.id, owner); end if;
  return created;
end;
$$;
revoke all on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean, uuid, timestamptz) from public, anon;
grant execute on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid, boolean, uuid, timestamptz) to authenticated;

-- One audited desk operation for the two things a reporter cannot decide about a story: the
-- byline and the dateline. It accepts any status, which is what lets the desk date a story
-- while it waits for approval and correct it long after it is live. A null publication date
-- means "leave the date alone", so a content-only correction never disturbs the dateline.
alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (
  action in ('approve_article', 'reject_article', 'hide_comment', 'remove_comment', 'restore_comment',
    'assign_role', 'review_application', 'review_withdrawal', 'edit_article', 'adjust_balance',
    'set_article_publication')
);

create or replace function public.admin_set_article_publication(
  p_article_id uuid,
  p_byline text default 'keep',
  p_author_id uuid default null,
  p_published_at timestamptz default null,
  p_reason text default null
)
returns public.articles
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  result public.articles;
  previous_owner uuid;
  next_owner uuid;
  next_anonymous boolean;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'পরিবর্তনের কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  if coalesce(p_byline, 'keep') not in ('keep', 'author', 'anonymous') then
    raise exception 'বাইলাইনের নির্দেশনা সঠিক নয়';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  -- Whoever the story credits today, whether that sits on its own row or in the attribution.
  previous_owner := coalesce(target.author_id,
    (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));

  next_owner := previous_owner;
  next_anonymous := coalesce(target.is_anonymous, false);
  if coalesce(p_byline, 'keep') = 'author' then
    if p_author_id is null then raise exception 'নির্বাচিত লেখকের আইডি প্রয়োজন'; end if;
    perform 1 from public.profiles where id = p_author_id;
    if not found then raise exception 'নির্বাচিত লেখকের প্রোফাইল পাওয়া যায়নি'; end if;
    next_owner := p_author_id;
    next_anonymous := false;
  elsif coalesce(p_byline, 'keep') = 'anonymous' then
    -- An anonymous byline still needs a real author on file for the fee and the audit trail,
    -- so a named author is taken when one is given and the known one is kept otherwise.
    if p_author_id is not null then
      perform 1 from public.profiles where id = p_author_id;
      if not found then raise exception 'নির্বাচিত লেখকের প্রোফাইল পাওয়া যায়নি'; end if;
      next_owner := p_author_id;
    end if;
    if next_owner is null then raise exception 'নাম প্রকাশে অনিচ্ছুক রাখতে লেখক নির্ধারণ করা প্রয়োজন'; end if;
    next_anonymous := true;
  end if;

  -- The credited row and the attribution table are two representations of the same fact and
  -- articles_author_matches_anonymity will not let them disagree, so they move together.
  update public.articles
     set author_id = case when next_anonymous then null else next_owner end,
         is_anonymous = next_anonymous,
         published_at = case when p_published_at is null then published_at else least(p_published_at, now()) end
   where id = p_article_id
   returning * into result;

  if next_anonymous then
    insert into public.article_attributions (article_id, author_id) values (p_article_id, next_owner)
      on conflict (article_id) do update set author_id = excluded.author_id;
  else
    delete from public.article_attributions where article_id = p_article_id;
  end if;

  -- The fee is deliberately left where it is: the ledger is append-only and the earning was
  -- paid for the reporting that happened, not for the byline. Re-bylining a story that was
  -- never published still pays the new author, because approval resolves the owner afresh.
  insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason, details)
    values (actor, 'set_article_publication', p_article_id, next_owner, trim(p_reason),
      jsonb_build_object('byline', coalesce(p_byline, 'keep'), 'anonymous', next_anonymous,
                         'previous_author_id', previous_owner, 'published_at', result.published_at));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'set_article_publication', p_article_id, trim(p_reason),
      jsonb_build_object('byline', coalesce(p_byline, 'keep'), 'anonymous', next_anonymous,
                         'previous_author_id', previous_owner, 'author_id', next_owner,
                         'published_at', result.published_at));
  return result;
end;
$$;
revoke all on function public.admin_set_article_publication(uuid, text, uuid, timestamptz, text) from public, anon;
grant execute on function public.admin_set_article_publication(uuid, text, uuid, timestamptz, text) to authenticated;

-- Approval used to stamp now() unconditionally, which would have thrown away a dateline the
-- desk had already chosen for a pending story. It keeps an existing date and only fills in
-- the moment of approval when there is none.
create or replace function public.moderate_article(p_article_id uuid, p_decision text, p_reason text)
returns public.articles
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  updated public.articles;
  logged_action text;
  owner_id uuid;
begin
  if not public.is_moderator_or_admin() then raise exception 'মডারেটর অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then raise exception 'সিদ্ধান্তের কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'সিদ্ধান্ত অনুমোদন অথবা প্রত্যাখ্যান হতে হবে'; end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null or target.status <> 'pending' then raise exception 'প্রতিবেদনটি আর অপেক্ষমাণ অবস্থায় নেই'; end if;
  owner_id := coalesce(target.author_id, (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  if owner_id = actor and p_decision = 'approve' then raise exception 'নিজের প্রতিবেদন নিজে অনুমোদন করা যাবে না' using errcode = '42501'; end if;
  logged_action := case when p_decision = 'approve' then 'approve_article' else 'reject_article' end;
  update public.articles set
    status = case when p_decision = 'approve' then 'published'::public.article_status else 'rejected'::public.article_status end,
    published_at = case when p_decision = 'approve' then coalesce(target.published_at, now()) else null end,
    rejected_at = case when p_decision = 'reject' then now() else null end,
    rejection_reason = case when p_decision = 'reject' then trim(p_reason) else null end
    where id = p_article_id returning * into updated;
  insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason)
    values (actor, logged_action, p_article_id, owner_id, trim(p_reason));
  if p_decision = 'approve' then perform public.add_article_earning(p_article_id, owner_id); end if;
  return updated;
end;
$$;

-- The desk edit form used to insist on a published story, which quietly broke the moderation
-- queue's own edit button: it edits a pending submission and always came back with the
-- published-only error. Author and date changes are also desk work on a story that has not
-- gone out yet, so the operation is opened to every status.
create or replace function public.admin_update_article(
  p_article_id uuid,
  p_title text,
  p_excerpt text,
  p_body text,
  p_reason text
)
returns public.articles language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  result public.articles;
  next_version integer;
  owner_id uuid;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'সম্পাদনার কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  owner_id := coalesce(target.author_id, (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  select coalesce(max(version), 0) + 1 into next_version
    from public.article_revisions where article_id = p_article_id;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (p_article_id, actor, next_version, target.title, target.excerpt, target.body, trim(p_reason));
  update public.articles set title = trim(p_title), excerpt = trim(p_excerpt), body = trim(p_body)
   where id = p_article_id returning * into result;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (p_article_id, actor, next_version + 1, result.title, result.excerpt, result.body, trim(p_reason));
  insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason, details)
    values (actor, 'edit_article', p_article_id, owner_id, trim(p_reason),
      jsonb_build_object('revision', next_version + 1, 'scope', 'admin'));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'edit_article', p_article_id, trim(p_reason), jsonb_build_object('revision', next_version + 1));
  return result;
end;
$$;

commit;
