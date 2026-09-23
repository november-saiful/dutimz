begin;

-- Readers can see what changed in a published story and why, without gaining
-- access to the raw revision history. That table names every editor and holds
-- the complete pre-edit text of drafts and rejected work, so it stays private
-- and this narrow function is the only public door into it.
--
-- One published edit writes two snapshot rows (the text before the change and
-- the text after it) that share a reason and a transaction timestamp, because
-- now() is fixed for the whole transaction. The feed reports that pair once, at
-- its newest version, and states whether the headline or the body moved.
create or replace function public.list_corrections(p_limit integer default 50)
returns table (
  article_id uuid,
  slug text,
  title text,
  revision integer,
  reason text,
  editor_label text,
  headline_changed boolean,
  body_changed boolean,
  edited_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  with edits as (
    select distinct on (r.article_id, r.reason, r.created_at)
           r.article_id, r.editor_id, r.version, r.reason, r.created_at
      from public.article_revisions r
      join public.articles a on a.id = r.article_id
     where a.status = 'published'
       and r.version > 1
     order by r.article_id, r.reason, r.created_at, r.version desc
  )
  select e.article_id,
         a.slug,
         a.title,
         e.version,
         e.reason,
         -- A reporter's own edits are attributed by name (their byline is
         -- already public); editorial desks stay anonymous as a desk.
         case when e.editor_id = a.author_id
              then coalesce(nullif(trim(p.display_name), ''), 'লেখক')
              else 'সম্পাদকীয় ডেস্ক' end as editor_label,
         coalesce(cur.title is distinct from prev.title, false) as headline_changed,
         coalesce(cur.body is distinct from prev.body, false) as body_changed,
         e.created_at
    from edits e
    join public.articles a on a.id = e.article_id
    join public.profiles p on p.id = e.editor_id
    left join public.article_revisions cur
      on cur.article_id = e.article_id and cur.version = e.version
    left join public.article_revisions prev
      on prev.article_id = e.article_id and prev.version = e.version - 1
   order by e.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
$$;

revoke all on function public.list_corrections(integer) from public;
grant execute on function public.list_corrections(integer) to anon, authenticated;

commit;
