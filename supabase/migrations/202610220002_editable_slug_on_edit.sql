begin;

-- Editable slugs on every edit path.
--
-- `submit_article` already lets the writer propose the Latin address; the same has to hold when
-- the story is corrected afterwards. The desk's immediate edit (`admin_update_article`) and the
-- author's requested correction (`submit_article_edit`, applied by `moderate_article_edit`) each
-- gain an optional `p_slug`: empty keeps the published address, a typed one is normalised through
-- the same `slugify_title` the submission uses and given the next free numeric suffix on collision.
-- Old callers keep working because the argument defaults to null.
alter table public.article_edit_requests
  add column if not exists slug text;

-- admin_update_article: same contract as 202610130001, plus the optional address.
drop function if exists public.admin_update_article(uuid, text, text, text, text);

create or replace function public.admin_update_article(
  p_article_id uuid,
  p_title text,
  p_excerpt text,
  p_body text,
  p_reason text,
  p_slug text default null
)
returns public.articles language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target public.articles;
  result public.articles;
  next_version integer;
  owner_id uuid;
  excerpt_text text;
  gallery_media uuid[];
  proposed_inline uuid[];
  media_key uuid;
  slug_base text;
  slug_candidate text := null;
  slug_attempt integer;
begin
  if not public.is_admin() then raise exception 'নির্বাহী অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'সম্পাদনার কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;
  select * into target from public.articles where id = p_article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  owner_id := coalesce(target.author_id, (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  excerpt_text := coalesce(nullif(trim(coalesce(p_excerpt, '')), ''), public.derive_excerpt(p_body));

  -- A typed address is normalised exactly like a submitted one. Empty keeps the published
  -- address, so a desk edit that touches only the text never moves a working link.
  if nullif(btrim(coalesce(p_slug, '')), '') is not null then
    slug_base := public.slugify_title(p_slug);
    if slug_base is null or slug_base = '' then
      raise exception 'ঠিকানাটি ইংরেজি ছোট হরফ, সংখ্যা ও হাইফেনে লিখুন';
    end if;
    if slug_base <> target.slug then
      slug_candidate := slug_base;
      slug_attempt := 1;
      while exists (select 1 from public.articles a where a.slug = slug_candidate and a.id <> p_article_id)
            and slug_attempt < 60 loop
        slug_attempt := slug_attempt + 1;
        slug_candidate := slug_base || '-' || slug_attempt::text;
      end loop;
      if exists (select 1 from public.articles a where a.slug = slug_candidate and a.id <> p_article_id) then
        raise exception 'এই ঠিকানায় অনেক প্রতিবেদন আছে; অন্য ঠিকানা লিখুন';
      end if;
    end if;
  end if;

  /*
    Reconcile the pictures the body places against `article_media`.

    Inline-only attachments are distinct from gallery attachments, so a text correction can remove
    an inline picture without accidentally removing a gallery entry that uses the same media id.
  */
  proposed_inline := coalesce(public.body_media_ids(p_body, '/media'), '{}');
  -- The pictures already in the body are the author's uploads; one the desk is adding now is the
  -- desk's own. Anything else would publish a third party's private upload.
  foreach media_key in array proposed_inline loop
    perform 1 from public.media_assets m
      where m.id = media_key and m.mime_type like 'image/%'
        and (m.owner_id = owner_id or m.owner_id = actor);
    if not found then raise exception 'যোগ করা ছবিগুলো লেখক বা আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি'; end if;
  end loop;
  select coalesce(array_agg(am.media_id order by am.position), '{}') into gallery_media
    from public.article_media am where am.article_id = p_article_id and am.is_gallery;
  if (select count(distinct attached.media_id)
        from (
          select unnest(gallery_media) as media_id
          union select unnest(proposed_inline)
          union select nullif(target.hero_media_key, '')::uuid
        ) attached
       where attached.media_id is not null) > 10 then
    raise exception 'একটি প্রতিবেদনে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;
  -- Reconcile inline placements against a body edit. Gallery rows are independent attachments,
  -- including the rare image that is in both places, so never delete or reposition those rows.
  -- Discarded inline-only rows go first: clearing the inline flag before deleting them would
  -- momentarily leave those rows attached neither way and violate the attachment-kind check.
  delete from public.article_media am
   where am.article_id = p_article_id and not am.is_gallery;
  update public.article_media am set is_inline = false
   where am.article_id = p_article_id and am.is_inline;
  update public.article_media am set is_inline = true
   where am.article_id = p_article_id
     and am.is_gallery and am.media_id = any (proposed_inline);
  -- Append new inline-only ids sequentially after the existing maximum. Since rows are inserted one
  -- at a time, the unique (article_id, position) constraint is never handed a colliding batch.
  for media_key in
    select item.key from unnest(proposed_inline) with ordinality as item(key, ord)
     where not exists (select 1 from public.article_media am
                        where am.article_id = p_article_id and am.media_id = item.key)
     order by item.ord
  loop
    insert into public.article_media (article_id, media_id, position, is_gallery, is_inline)
    select p_article_id, media_key, coalesce(max(am.position) + 1, 0), false, true
      from public.article_media am where am.article_id = p_article_id;
  end loop;

  select coalesce(max(version), 0) + 1 into next_version
    from public.article_revisions where article_id = p_article_id;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (p_article_id, actor, next_version, target.title, target.excerpt, target.body, trim(p_reason));
  update public.articles set title = trim(p_title), excerpt = excerpt_text, body = trim(p_body),
         slug = coalesce(slug_candidate, slug)
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

-- submit_article_edit: same contract as 202610130003, plus the optional proposed address.
-- Nothing is still written to `articles` here; the proposal waits for the desk.
drop function if exists public.submit_article_edit(uuid, text, text, text, text);

create or replace function public.submit_article_edit(
  p_article_id uuid,
  p_title text,
  p_excerpt text,
  p_body text,
  p_reason text,
  p_slug text default null
)
returns public.article_edit_requests
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_role public.app_role;
  target public.articles;
  owner_id uuid;
  excerpt_text text;
  inline_media uuid[];
  gallery_media uuid[];
  media_key uuid;
  slug_value text := null;
  created public.article_edit_requests;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select role into actor_role from public.user_roles where user_id = actor;
  if actor_role not in ('reporter', 'moderator', 'admin') then
    raise exception 'প্রতিবেদন সম্পাদনার অনুমতি প্রয়োজন' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'সম্পাদনার কারণ আবশ্যক (৩–৫০০ অক্ষর)';
  end if;

  select * into target from public.articles where id = p_article_id;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  owner_id := public.article_author_of_record(p_article_id);
  if owner_id is distinct from actor then
    raise exception 'নিজের প্রকাশিত প্রতিবেদনের সম্পাদনা অনুরোধ করা যাবে' using errcode = '42501';
  end if;
  if target.status <> 'published' then
    raise exception 'কেবল প্রকাশিত প্রতিবেদনের সম্পাদনা অনুরোধ করা যায়';
  end if;

  -- The column's own constraints, checked here so the writer reads a sentence about their
  -- correction instead of a constraint name when it is approved.
  if char_length(trim(coalesce(p_title, ''))) not between 5 and 180 then
    raise exception 'শিরোনাম ৫–১৮০ অক্ষরের মধ্যে হতে হবে';
  end if;
  if char_length(trim(coalesce(p_body, ''))) < 100 then
    raise exception 'পূর্ণ প্রতিবেদন কমপক্ষে ১০০ অক্ষরের হতে হবে';
  end if;
  if p_excerpt is not null and char_length(trim(p_excerpt)) not between 10 and 280 then
    raise exception 'সংক্ষিপ্ত পরিচিতি ১০–২৮০ অক্ষরের মধ্যে হতে হবে';
  end if;
  excerpt_text := coalesce(nullif(trim(coalesce(p_excerpt, '')), ''), public.derive_excerpt(p_body));

  -- A proposed address is normalised up front so the author reads the refusal now, not after
  -- the desk has approved everything else about the correction.
  if nullif(btrim(coalesce(p_slug, '')), '') is not null then
    slug_value := public.slugify_title(p_slug);
    if slug_value is null or slug_value = '' then
      raise exception 'ঠিকানাটি ইংরেজি ছোট হরফ, সংখ্যা ও হাইফেনে লিখুন';
    end if;
  end if;

  -- Pictures the correction places in its text. They must be this writer's own uploads: the
  -- approved body inserts them into `article_media`, which is what makes them readable once the
  -- story is public, so nothing another account uploaded may be attached this way.
  inline_media := coalesce(public.body_media_ids(p_body, '/media'), '{}');
  foreach media_key in array inline_media loop
    perform 1 from public.media_assets m
      where m.id = media_key and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then
      raise exception 'যোগ করা ছবিগুলো আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি';
    end if;
  end loop;
  -- Refused as a sentence rather than as an index violation, so the writer is told why.
  select coalesce(array_agg(am.media_id order by am.position), '{}') into gallery_media
    from public.article_media am where am.article_id = p_article_id and am.is_gallery;
  if (select count(distinct attached.media_id)
        from (
          select unnest(gallery_media) as media_id
          union select unnest(inline_media)
          union select nullif(target.hero_media_key, '')::uuid
        ) attached
       where attached.media_id is not null) > 10 then
    raise exception 'একটি প্রতিবেদনে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;

  if exists (select 1 from public.article_edit_requests r
              where r.article_id = p_article_id and r.status = 'pending') then
    raise exception 'এই প্রতিবেদনের একটি সম্পাদনার অনুরোধ এখনো অনুমোদনের অপেক্ষায় আছে';
  end if;

  insert into public.article_edit_requests (article_id, editor_id, title, excerpt, body, slug, reason)
    values (p_article_id, actor, trim(p_title), excerpt_text, trim(p_body), slug_value, trim(p_reason))
    returning * into created;
  return created;
end;
$$;

-- moderate_article_edit: approving applies the proposed address beside the proposed text.
-- Same signature, so no drop is needed: `create or replace` keeps the grants.
create or replace function public.moderate_article_edit(
  p_request_id uuid,
  p_decision text,
  p_reason text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  request public.article_edit_requests;
  target public.articles;
  updated public.articles;
  owner_id uuid;
  next_version integer;
  excerpt_text text;
  proposed_inline uuid[];
  gallery_media uuid[];
  gallery_offset integer;
  media_key uuid;
  slug_base text;
  slug_candidate text := null;
  slug_attempt integer;
begin
  if not public.is_moderator_or_admin() then
    raise exception 'মডারেটর অনুমতি প্রয়োজন' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'সিদ্ধান্ত অনুমোদন অথবা প্রত্যাখ্যান হতে হবে';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'সিদ্ধান্তের কারণ ৩–৫০০ অক্ষরের মধ্যে লিখুন';
  end if;

  select * into request from public.article_edit_requests where id = p_request_id for update;
  if request.id is null then raise exception 'সম্পাদনার অনুরোধ পাওয়া যায়নি'; end if;
  if request.status <> 'pending' then raise exception 'এই অনুরোধটি আর অপেক্ষমাণ অবস্থায় নেই'; end if;
  -- The desk may not wave through its own proposal, exactly as it may not approve its own story.
  if request.editor_id = actor then
    raise exception 'নিজের সম্পাদনার অনুরোধ নিজে অনুমোদন করা যাবে না' using errcode = '42501';
  end if;

  if p_decision = 'reject' then
    update public.article_edit_requests
       set status = 'rejected', reviewed_by = actor, reviewed_at = now(), review_reason = trim(p_reason)
     where id = p_request_id;
    insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason, details)
      values (actor, 'reject_article_edit', request.article_id, request.editor_id, trim(p_reason),
        jsonb_build_object('request_id', p_request_id));
    insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
      values (actor, 'reject_article_edit', p_request_id, trim(p_reason),
        jsonb_build_object('article_id', request.article_id, 'editor_id', request.editor_id));
    return;
  end if;

  select * into target from public.articles where id = request.article_id for update;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  owner_id := public.article_author_of_record(request.article_id);
  excerpt_text := coalesce(nullif(trim(request.excerpt), ''), public.derive_excerpt(request.body));

  -- The approved address moves with the approved text. A request that proposed no address
  -- (or the address the story already carries) leaves the published link untouched.
  if request.slug is not null and nullif(btrim(request.slug), '') is not null then
    slug_base := public.slugify_title(request.slug);
    if slug_base is null or slug_base = '' then
      raise exception 'ঠিকানাটি ইংরেজি ছোট হরফ, সংখ্যা ও হাইফেনে লিখুন';
    end if;
    if slug_base <> target.slug then
      slug_candidate := slug_base;
      slug_attempt := 1;
      while exists (select 1 from public.articles a where a.slug = slug_candidate and a.id <> request.article_id)
            and slug_attempt < 60 loop
        slug_attempt := slug_attempt + 1;
        slug_candidate := slug_base || '-' || slug_attempt::text;
      end loop;
      if exists (select 1 from public.articles a where a.slug = slug_candidate and a.id <> request.article_id) then
        raise exception 'এই ঠিকানায় অনেক প্রতিবেদন আছে; অন্য ঠিকানা লিখুন';
      end if;
    end if;
  end if;

  /*
    Reconcile body-owned attachments separately from gallery attachments. Each approved body image
    must belong to the author, and only inline-only rows are discarded when the body changes.
  */
  proposed_inline := coalesce(public.body_media_ids(request.body, '/media'), '{}');
  foreach media_key in array proposed_inline loop
    perform 1 from public.media_assets m
      where m.id = media_key and m.owner_id = request.editor_id and m.mime_type like 'image/%';
    if not found then
      raise exception 'যোগ করা ছবিগুলো লেখকের নিজের আপলোড করা নয় বা পাওয়া যায়নি';
    end if;
  end loop;
  select coalesce(array_agg(am.media_id order by am.position), '{}') into gallery_media
    from public.article_media am where am.article_id = request.article_id and am.is_gallery;
  if (select count(distinct attached.media_id)
        from (
          select unnest(gallery_media) as media_id
          union select unnest(proposed_inline)
          union select nullif(target.hero_media_key, '')::uuid
        ) attached
       where attached.media_id is not null) > 10 then
    raise exception 'একটি প্রতিবেদনে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;
  -- Discarded inline-only rows go first: clearing the inline flag before deleting them would
  -- momentarily leave those rows attached neither way and violate the attachment-kind check.
  -- Only gallery rows have their flag cleared below, so no surviving row can end up (false, false).
  delete from public.article_media am
   where am.article_id = request.article_id and not am.is_gallery;
  update public.article_media am set is_inline = false
   where am.article_id = request.article_id and am.is_inline;
  update public.article_media am set is_inline = true
   where am.article_id = request.article_id
     and am.is_gallery and am.media_id = any (proposed_inline);
  -- Preserve gallery positions; reinsert inline-only pictures in their new body order.
  for media_key in
    select item.key from unnest(proposed_inline) with ordinality as item(key, ord)
     where not exists (select 1 from public.article_media am
                        where am.article_id = request.article_id and am.media_id = item.key)
     order by item.ord
  loop
    insert into public.article_media (article_id, media_id, position, is_gallery, is_inline)
    select request.article_id, media_key, coalesce(max(am.position) + 1, 0), false, true
      from public.article_media am where am.article_id = request.article_id;
  end loop;

  select coalesce(max(version), 0) + 1 into next_version
    from public.article_revisions where article_id = request.article_id;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (request.article_id, actor, next_version, target.title, target.excerpt, target.body, trim(p_reason));
  update public.articles
     set title = trim(request.title), excerpt = excerpt_text, body = trim(request.body),
         slug = coalesce(slug_candidate, slug)
   where id = request.article_id returning * into updated;
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (request.article_id, actor, next_version + 1, updated.title, updated.excerpt, updated.body, trim(p_reason));

  update public.article_edit_requests
     set status = 'approved', reviewed_by = actor, reviewed_at = now(), review_reason = trim(p_reason)
   where id = p_request_id;

  insert into public.moderation_actions (actor_id, action, article_id, target_user_id, reason, details)
    values (actor, 'approve_article_edit', request.article_id, request.editor_id, trim(p_reason),
      jsonb_build_object('request_id', p_request_id, 'revision', next_version + 1));
  insert into public.admin_audit_log (actor_id, action, target_id, reason, details)
    values (actor, 'approve_article_edit', p_request_id, trim(p_reason),
      jsonb_build_object('article_id', request.article_id, 'editor_id', request.editor_id,
        'revision', next_version + 1));
end;
$$;

revoke all on function public.admin_update_article(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.admin_update_article(uuid, text, text, text, text, text) to authenticated;
revoke all on function public.submit_article_edit(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.submit_article_edit(uuid, text, text, text, text, text) to authenticated;

commit;
