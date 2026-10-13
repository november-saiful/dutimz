-- Spotlight descriptions become Markdown, and a post's pictures can sit inside the text.
--
-- A description is now authored Markdown: a writer pastes from a web page, Word or a spreadsheet and
-- keeps the headings, lists, links, quotes and tables. 5000 characters was a plain-text ceiling and
-- Markdown plus image syntax needs more room, so the cap moves and nothing else about the column
-- changes.
--
-- The pictures are the part that cannot live in the text alone. The media Worker resolves a Spotlight
-- object through `get_spotlight_media`, which grants a public read on exactly one condition: the
-- object has a row in `spotlight_post_media`. A picture written into the description is therefore
-- invisible to a reader until this migration has turned that reference into an attachment row. That
-- is the reason this file exists, and why `get_spotlight_media` is deliberately left alone.
begin;

-- The plain-text ceiling. Markdown and image syntax need more than 5000 characters.
alter table public.spotlight_posts drop constraint if exists spotlight_posts_description_check;
alter table public.spotlight_posts add constraint spotlight_posts_description_check
  check (char_length(trim(description)) between 10 and 20000);

-- Preserve whether an attachment came from the gallery or the body. The same image can be both;
-- later removing it from the description must not remove the gallery's independent public link.
alter table public.spotlight_post_media
  add column is_gallery boolean not null default true,
  add column is_inline boolean not null default false,
  add constraint spotlight_post_media_attachment_kind check (is_gallery or is_inline);

-- Submission. The pictures the description places in the text are attached to the post exactly as
-- the ones the uploader listed are, through `public.body_media_ids(p_body, p_base)` — the single
-- definition of what an inline reference looks like to the database, created by the article
-- migration `202610130001_article_rich_text.sql`, which runs before this one. It is called here with
-- '/spotlight/media'; its signature is shared by both domains and neither may change it. The
-- ten-picture cap counts the pictures rather than the ways the author named them.
create or replace function public.submit_spotlight_post(
  p_title text,
  p_description text,
  p_media_ids text[] default null
)
returns public.spotlight_posts
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  created public.spotlight_posts;
  media text[] := '{}';
  attached text[] := '{}';
  media_key text;
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;

  -- The uploader's list: normalised to lower case, de-duplicated, blanks dropped, order kept.
  if p_media_ids is not null then
    select coalesce(array_agg(dedup.k order by dedup.ord), '{}') into media
      from (select lower(btrim(entry.k)) as k, min(entry.ord) as ord
              from unnest(p_media_ids) with ordinality as entry(k, ord)
             where entry.k is not null and btrim(entry.k) <> '' group by 1) dedup;
  end if;

  -- One list for counting and ownership checks, de-duplicated so a gallery image referenced inline
  -- is still one image for the ten-picture limit.
  select coalesce(array_agg(dedup.k order by dedup.ord), '{}') into attached
    from (select lower(btrim(entry.k)) as k, min(entry.ord) as ord
            from unnest(coalesce(media, '{}') || coalesce(public.body_media_ids(p_description, '/spotlight/media')::text[], '{}'))
                   with ordinality as entry(k, ord)
           where entry.k is not null and btrim(entry.k) <> '' group by 1) dedup;

  if coalesce(array_length(attached, 1), 0) > 10 then
    raise exception 'একটি পোস্টে সর্বোচ্চ ১০টি ছবি যুক্ত করা যায়';
  end if;

  -- Every picture, however it was named, has to be this author's own upload of an image.
  foreach media_key in array attached loop
    if media_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'ছবির তালিকায় অবৈধ ফাইল আইডি আছে';
    end if;
    perform 1 from public.spotlight_media_assets m
      where m.id = media_key::uuid and m.owner_id = actor and m.mime_type like 'image/%';
    if not found then raise exception 'যোগ করা ছবিগুলো আপনার নিজের আপলোড করা নয় বা পাওয়া যায়নি'; end if;
  end loop;

  insert into public.spotlight_posts (author_id, title, description)
    values (actor, trim(p_title), trim(p_description))
    returning * into created;

  -- The gallery and body references are distinct facts, even when they name the same file.
  insert into public.spotlight_post_media (post_id, media_id, position, is_gallery, is_inline)
  select created.id, item.key::uuid, item.ord - 1, true, false
    from unnest(media) with ordinality as item(key, ord)
  on conflict (post_id, media_id) do update set is_gallery = true;
  update public.spotlight_post_media pm set is_inline = true
   where pm.post_id = created.id
     and pm.media_id::text = any (coalesce(public.body_media_ids(p_description, '/spotlight/media')::text[], '{}'));

  -- Only new inline-only files need rows. The gallery/body overlap was marked above, leaving those
  -- gallery positions stable while the body references are added afterward in their own order.
  for media_key in
    select item.key from unnest(public.body_media_ids(p_description, '/spotlight/media')) with ordinality as item(key, ord)
     where not exists (select 1 from public.spotlight_post_media pm
                        where pm.post_id = created.id and pm.media_id = item.key)
     order by item.ord
  loop
    insert into public.spotlight_post_media (post_id, media_id, position, is_gallery, is_inline)
    select created.id, media_key::uuid, coalesce(max(pm.position) + 1, 0), false, true
      from public.spotlight_post_media pm where pm.post_id = created.id;
  end loop;

  return created;
end;
$$;

-- Every public read of a Spotlight picture goes through `get_spotlight_media`, which resolves the
-- object with `exists (select 1 from spotlight_post_media where media_id = m.id)`. That lookup is by
-- media_id, the trailing column of this table's primary key, so it cannot use the key and reads the
-- whole index instead. Positions inside the description multiply the rows per post, which makes the
-- one query that serves every image on the site the place to fix it.
create index if not exists spotlight_post_media_media_idx
  on public.spotlight_post_media (media_id);

-- The helper is a callable only from the SECURITY DEFINER functions that need it, exactly as
-- `derive_excerpt` is: no client has a reason to resolve media ids and none is given one.
revoke all on function public.body_media_ids(text, text) from public, anon, authenticated;
revoke all on function public.submit_spotlight_post(text, text, text[]) from public, anon;
grant execute on function public.submit_spotlight_post(text, text, text[]) to authenticated;

commit;
