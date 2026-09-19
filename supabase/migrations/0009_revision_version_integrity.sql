-- ============================================
-- 0009_revision_version_integrity.sql
--
-- `content_revisions.version` is the per-story revision counter the whole
-- history UI leans on: `?version=N` lookups (restore, preview) resolve to a
-- single row, the "current" badge compares the newest revision with
-- `contents.version`, and the list is ordered by it. Nothing in the schema
-- stopped two revisions of one story from claiming the same number, and the
-- application did exactly that:
--
--   * approving a story reused the version number of the edit it published
--     (the workflow kept the counter on "go live"), so the publish revision
--     collided with the revision it published;
--   * both desks computed the next number as `contents.version + 1` from a row
--     read earlier in the request, so two saves racing on one story could both
--     claim it. The loser's history vanished into an unordered duplicate.
--
-- This migration makes `(content_id, version)` unique — the guard the
-- application now relies on to detect a racing save — repairs the rows that
-- already collide, and re-syncs `contents.version` so a story's counter always
-- matches its newest revision.
-- ============================================

-- ------------------------------------------------------------
-- 1. Repair existing duplicates
-- ------------------------------------------------------------
-- The first row of a colliding group keeps its number: that is the one any
-- existing `?version=N` link or open editor is pointing at. The others are
-- renumbered above the story's current maximum, in creation order, so the
-- sequence stays ordered and no number is invented below an existing one.
WITH ranked AS (
    SELECT
        id,
        content_id,
        version,
        ROW_NUMBER() OVER (
            PARTITION BY content_id, version
            ORDER BY created_at NULLS FIRST, id
        ) AS occurrence,
        MAX(version) OVER (PARTITION BY content_id) AS max_version
    FROM public.content_revisions
), extras AS (
    SELECT
        id,
        max_version,
        ROW_NUMBER() OVER (
            PARTITION BY content_id
            ORDER BY version, created_at NULLS FIRST, id
        ) AS new_offset
    FROM ranked
    WHERE occurrence > 1
)
UPDATE public.content_revisions AS r
   SET version = e.max_version + e.new_offset
  FROM extras e
 WHERE r.id = e.id;

-- ------------------------------------------------------------
-- 2. One version number per story, enforced
-- ------------------------------------------------------------
-- Also the index behind "newest revision of a story" and the single-version
-- lookup, both of which filter on content_id and order by version.
ALTER TABLE public.content_revisions
    DROP CONSTRAINT IF EXISTS content_revisions_content_version_key;
ALTER TABLE public.content_revisions
    ADD CONSTRAINT content_revisions_content_version_key
    UNIQUE (content_id, version);

-- ------------------------------------------------------------
-- 3. Re-sync the story counter with its history
-- ------------------------------------------------------------
-- After the renumbering above, a story's newest revision can sit above
-- `contents.version`; leaving it would make the history panel mark the wrong
-- entry as current. Only ever moves the counter forward.
UPDATE public.contents AS c
   SET version = m.max_version
  FROM (
      SELECT content_id, MAX(version) AS max_version
        FROM public.content_revisions
       GROUP BY content_id
  ) AS m
 WHERE m.content_id = c.id
   AND c.version < m.max_version;
