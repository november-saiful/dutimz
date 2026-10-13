# Rich content, inline images, and approval-gated edits

Plan for three linked changes to DUTIMZ:

1. Formatting-preserving text in **news articles** and **Spotlight posts** (paste from a web page,
   Word document, or spreadsheet and keep headings, bold/italic, lists, links, quotes and tables).
2. **Images inside the text** — uploaded through the existing media pipeline, or referenced from
   what the author already uploaded.
3. **Post-publication edits** by the author, which only go live once a moderator or an admin
   approves them from a **new section of the moderation page**.

Status: implemented. Local typechecks, production build, and UI/overflow/static suites pass; live pgTAP verification requires a local Supabase database.

---

## 1. Acceptance criteria

| # | Requirement | Verified by |
|---|---|---|
| R1 | Copy from a web page / Word / Sheets into the article or Spotlight composer and paste back out with headings, bold, italic, lists, links, blockquotes and tables intact. | Manual: paste a real Word doc and a Sheets table, preview, publish, compare. |
| R1b | The same formatted text renders on the public article page, the pending-article preview, the Spotlight feed, the Spotlight detail page and every moderation surface. | Manual + `tests/ui-smoke.test.mjs` source assertions. |
| R1c | Search results, `derive_excerpt`, sitemap and every existing plain-text consumer behave exactly as today. | pgTAP excerpt assertions + existing search assertions. |
| R1d | No stored content can execute script. No `dangerouslySetInnerHTML` on any user content. | Source assertion: no new `dangerouslySetInnerHTML` outside the two existing JSON-LD/chart uses. |
| R2 | A reporter/mod can insert an uploaded image between paragraphs; it appears exactly where written, and it loads for a signed-out reader once the story is published. | Manual: place an image mid-text, publish, open in a private window. |
| R2b | An author can reference an image they already uploaded without re-uploading. | Manual. |
| R2c | Inline images do not also appear in the "ছবির গ্যালারি" strip. | Manual + `app/news/[slug]/page.tsx` assertion. |
| R2d | Removing an inline image from the body removes it from the set the media host will serve publicly. | pgTAP: `/media/<id>` resolves for a signed-out reader before removal and not after. |
| R3 | An author can request an edit to their own published story or Spotlight post; nothing changes on the live page until approval. | Manual + pgTAP. |
| R3b | Moderators/admins approve or reject with a mandatory reason, from a **new section** on `/account/moderation`. | Manual + `tests/ui-smoke.test.mjs`. |
| R3c | Approval writes the story, the revision history and the moderation audit log; rejection stores the reason for the author. | pgTAP. |
| R3d | Nobody approves their own request. | pgTAP (mirrors the existing `moderate_article` rule). |

---

## 2. Current state (the constraints that shape the design)

**Content is plain text today.**

- `articles.body text` — `char_length >= 100`, rendered in
  [page.tsx](app/news/[slug]/page.tsx) by `article.body.split(/\n{2,}/)` into `<p>` tags.
  Same split in [pending-article.tsx](components/article/pending-article.tsx) and
  [admin-articles.tsx](components/account/admin-articles.tsx).
- `spotlight_posts.description text` — 10–5000 chars, rendered with `whitespace-pre-line` in
  [spotlight-forum.tsx](components/forum/spotlight-forum.tsx) and
  [app/spotlight/[id]/page.tsx](app/spotlight/[id]/page.tsx).
- The composer is a plain `<Textarea>` in [writer-form.tsx](components/account/writer-form.tsx) and
  [spotlight-forum.tsx](components/forum/spotlight-forum.tsx).

**`body` has four non-obvious dependents** — this is why the body column must not become HTML:

1. `articles.search_document tsvector generated always as (to_tsvector('simple', title || excerpt || body))`
   ([202609240001_initial_schema.sql](supabase/migrations/202609240001_initial_schema.sql#L97)).
   A generated column cannot be re-pointed cheaply, and indexing HTML tags is wrong.
2. `public.derive_excerpt(p_body)` — `immutable`, called by every submit/edit RPC
   ([202610010001_article_short_description.sql](supabase/migrations/202610010001_article_short_description.sql#L10)).
3. `article_revisions.body` snapshots written by every RPC.
4. `admin-articles.tsx` preview and `moderation-queue.tsx` (`whitespace-pre-wrap`).

**Media pipeline already exists and is reusable.**

- Upload: `POST /upload` (news) and `POST /spotlight/upload`
  ([worker/src/index.ts](worker/src/index.ts)) — bearer token, role-gated for news, re-encoded to
  WebP ≤200 KB, row written to `media_assets` / `spotlight_media_assets`.
- Read: `/media/:id` and `/spotlight/media/:id` resolve through the SECURITY DEFINER RPCs
  `get_media_asset` / `get_spotlight_media`.
- **`get_media_asset.is_public` is true when the media is the published article's hero *or* has an
  `article_media` row for a published article** ([202609280001_article_image_gallery.sql](supabase/migrations/202609280001_article_image_gallery.sql#L32)).
  `get_spotlight_media` is public when a `spotlight_post_media` row exists.
  → **Any inline image that also gets an attachment row is publicly readable for free.** This is the
  single most important existing behaviour the design leans on.
- Client uploader: [gallery-uploader.tsx](components/account/gallery-uploader.tsx) (`scope="article" | "spotlight"`).

**Moderation today.**

- `/account/moderation` → [moderation-queue.tsx](components/account/moderation-queue.tsx): two cards,
  pending articles (`status = 'pending'`) and non-visible comments.
- `/account/admin` → `admin-articles.tsx` + `admin-dashboard.tsx`: the desk can already edit any
  article immediately via `admin_update_article`, re-date it, take it down (`admin_set_article_status`).
- `update_own_article(...)` **already writes the author's edit live, with no approval** — but only for
  admin/moderator/executive-tier reporters. Junior and general reporters cannot edit at all.
  This is the behaviour R3 replaces.
- `moderation_actions.action` has a `CHECK` list; new decision verbs require dropping and re-adding it
  (precedent: [202610010004_spotlight_moderation.sql](supabase/migrations/202610010004_spotlight_moderation.sql)).

**Repo conventions that bind the work.**

- Migrations are ordered, atomic (`commit;` last line), one concern each. Latest is
  `202610100002`; new ones start `20261013…`.
- Every RPC: `security definer`, `set search_path = ''`, `revoke all on function … from public, anon`
  then an explicit `grant execute`.
- No client write grants: content changes go through RPCs.
- `tests/pgtap-plan.test.mjs` asserts `select plan(N)` in
  [dutimiz_rls.test.sql](supabase/tests/dutimiz_rls.test.sql#L2) equals the number of assertion
  statements — **any new pgTAP assertion needs the plan number bumped.**
- `tests/ui-smoke.test.mjs` is a set of **static source assertions**. Guardrails it currently holds
  that this work must not break:
  - `app/news/[slug]/page.tsx` still contains `className="article-body"`, and never `max-w-[68ch]`.
  - `app/globals.css` still contains `.article-main p {`.
  - `admin-articles.tsx` still calls `admin_update_article`, `admin_set_article_publication`,
    `admin_set_article_status`; contains `from("articles")` and `admin_member_records`; contains
    **no** `UUID` and **no** `.delete(`.
  - `writer-form.tsx` still uses `navigator.clipboard.writeText`, `SITE_URL}/news/`, and reads the
    slug from the RPC response.
- `tests/overflow.test.mjs` drives a real browser — **a wide table in an article body will fail it
  unless the table scrolls inside its own box.**

---

## 3. Decisions

### 3.1 Storage format: Markdown in the existing `body` / `description` column (confirmed)

| | Markdown in `body` | Structured JSON blocks in a new column | Sanitized HTML in a new column |
|---|---|---|---|
| Search / `derive_excerpt` / tsvector | untouched (one strip pass) | `body` derived from blocks — new machinery | needs a plain-text twin column |
| Revisions, previews, moderation | untouched | every surface must learn blocks | every surface must learn HTML |
| XSS surface | none — `react-markdown` returns elements, raw HTML is not rendered | none | needs a real sanitizer in the Worker runtime |
| Tables | GFM pipe tables, **no merged cells** | can model `colspan`/`rowspan` | faithful if allowlisted |
| Deps | 4 small ones | 0–1 | 1 + a plain-text deriver |
| Word/web paste | Turndown + GFM plugin | hand-written HTML→blocks walker | none (paste HTML directly) |

**Decision: Markdown** *(confirmed)*. It preserves everything the request names — headings, bold,
italic, lists, links, blockquotes, tables — while leaving the search index, excerpt derivation,
revision history and every existing render surface structurally unchanged. The one real loss is
merged table cells (`colspan`/`rowspan`), which GFM cannot express (confirmed against the Turndown
GFM plugin source: no span handling) — **accepted, spans flatten to ordinary cells**. Colours, fonts
and precise spacing are lost either way, which is correct for an editorial product: a story must not
carry a Word document's typography onto the site.

### 3.2 Inline image syntax: a relative media path in standard Markdown

```
![ছবির বর্ণনা](/media/6f3c…-uuid)
![ছবির বর্ণনা](/spotlight/media/6f3c…-uuid)
```

Why this exact form:

- **Relative URLs survive `react-markdown`'s default URL transform** untouched. A custom
  `media:<uuid>` scheme would be treated as an unknown protocol and **stripped to an empty `src`**
  by `defaultUrlTransform`; a custom `urlTransform` would mean re-implementing protocol safety.
- The path is what actually identifies the object, so the renderer maps it to
  `mediaUrlFor(id)` / `spotlightMediaUrlFor(id)` and the stored Markdown stays host-agnostic.
- It is readable and greppable in the raw body, and directly extractable in SQL with one regexp, so
  the database — not the client — decides which images a story is allowed to reference.
- `javascript:` and `data:` URLs stay blocked by the default transform.

**Decision: uploaded media only** *(confirmed)*. The "referencing option" means *insert an image you
already uploaded* — no arbitrary external hosts. So the renderer maps the media paths and leaves
other image URLs alone, and the composers offer no URL-entry field. This keeps third-party tracking
off the article page and leaves nothing external to moderate. If external URLs are ever wanted, the
`img` override is the single place that decides whether to render them.

### 3.3 Rendering, never injecting

A single shared renderer, `components/ui/rich-text-content.tsx`, wraps `react-markdown` +
`remark-gfm` + `remark-breaks` and returns React elements. No `dangerouslySetInnerHTML` anywhere.
Used on the public article page (Server Component), the Spotlight list and detail pages, the pending
preview, the moderation queue and the admin preview.

`remark-breaks` is included because existing Spotlight descriptions use single newlines that
`whitespace-pre-line` currently preserves; without it, old posts would collapse into one paragraph.

### 3.4 Editors

`components/ui/rich-text-editor.tsx` — a toolbar over a `<textarea>` with a live preview that uses
the *same* renderer, so the author sees exactly what publishes. Toolbar: heading, bold, italic,
bullet list, numbered list, quote, table, link, image, code. This keeps the project's no-heavy-
dependency taste, works on mobile, and needs no content model beyond the Markdown we already store.

Paste handling: on `paste`, if `text/html` is present, convert it to Markdown with Turndown +
`turndown-plugin-gfm` (bold, headings, lists, tables, links, quotes) and insert the result at the
caret. `text/plain` falls back to normal paste.

### 3.5 Who may edit, and what needs approval

- **Author-initiated edits always queue.** Every reporter tier — **junior, general and executive**
  *(confirmed)* — plus the author of a Spotlight post, creates a *request*. This widens today's
  executive-only rule to match "users should be able to edit their writings". Nothing goes live.
- **The desk's own console edit stays immediate.** An admin editing from `/account/admin` is
  already the approval authority; queuing it behind a second admin would be theatre. It stays
  audited by `admin_update_article`.
- **Self-approval is refused**, matching `moderate_article`'s existing rule.
- One pending request per story / post at a time (partial unique index, mirroring
  `one_pending_reporter_application_per_user`).

---

## 4. Data model and RPCs

### Migration 1 — `202610130001_article_rich_text.sql`

- Re-create `public.derive_excerpt(p_body text)` to strip Markdown before the existing
  sentence-window logic: images (`!\[…\]\(…\)`), link syntax (keep the label), `#`-headings,
  `**`/`__`/`*`/`_` emphasis, backticks, `>` quotes, table pipes and separator rows, `---` rules.
- New immutable helper `public.body_media_ids(p_body text, p_base text) returns uuid[]` — the media
  ids referenced by `![…](<base>/<uuid>)`, in document order, de-duplicated, with each id validated
  as a UUID.
- Extend `public.submit_article(...)`, `public.admin_update_article(...)` and the approved-edit path to
  reconcile the body's media into `public.article_media`. **`article_media` is
  `primary key (article_id, media_id)` *and* `unique (article_id, position)`**, which makes the
  obvious implementation wrong in two ways — so the rule is written down here rather than left to the
  implementer:

  ```
  -- <article> is the row being written, already locked `for update` by the calling RPC.
  inline  := public.body_media_ids(p_body, '/media');   -- referenced in the body, in reading order
  gallery := the article's existing explicit attachment list  (submit: p_media_keys)
  hero    := the article's hero_media_key

  1. Validate every id in `inline` exactly as the gallery loop already does — media_assets owner is
     the actor and mime_type like 'image/%' — and reject the whole call if any one fails.
  2. Delete only the rows that are inline-only and no longer referenced:
       delete from public.article_media am
        where am.article_id = <article>
          and am.media_id::text <> coalesce(hero, '')
          and not (am.media_id = any (gallery))
          and not (am.media_id = any (inline));
     A body edit never removes a gallery entry or the hero.
  3. Insert the newly referenced ids at positions continuing after the highest existing one:
       insert into public.article_media (article_id, media_id, position)
       select <article>, item.key, base.max_position + item.ord
         from unnest(inline) with ordinality as item(key, ord)
         cross join (select coalesce(max(position) + 1, 0) as max_position
                       from public.article_media where article_id = <article>) base
        where not exists (select 1 from public.article_media am
                           where am.article_id = <article> and am.media_id = item.key);
  ```

  Two traps this closes. A **correlated** `max(position)` reads the same value for every row in the
  insert and hands them all one position, violating `unique (article_id, position)` and failing the
  whole submission — hence the single cross-joined snapshot. And step 2 must run for edits, not only
  submissions: without it, deleting an image from a published body would leave it publicly readable at
  `/media/<id>` forever, because `get_media_asset` grants public access on the mere existence of an
  `article_media` row.

  **No signature change** — parsing the body avoids the PostgREST named-argument trap that the
  existing `p_excerpt` comment warns about. For the desk edit, `gallery` is the article's current
  attachment list, so a body-only correction leaves the gallery untouched.
- **`get_media_asset` needs no change**: an inline image that has an `article_media` row is public
  for a published story, and private otherwise. That is exactly the right behaviour for a
  not-yet-published draft too.

### Migration 2 — `202610130002_spotlight_rich_text.sql`

- Raise `spotlight_posts.description` from 5000 to 20000 chars (Markdown plus image syntax).
- Extend `public.submit_spotlight_post(...)` the same way for `spotlight_post_media`. This table is
  **looser than the article one**: `primary key (post_id, media_id)` but *no* `unique
  (post_id, position)`, so positions are a plain counter and the same delete-then-insert
  reconciliation applies (validate ownership against `spotlight_media_assets`, drop inline-only rows
  that are no longer referenced, insert the rest in body order) — only the position arithmetic is
  simpler.
- `get_spotlight_media` needs no change (attachment row ⇒ public).

### Migration 3 — `202610130003_pending_content_edits.sql`

```
public.article_edit_requests
  id, article_id → articles, editor_id → profiles,
  title, excerpt, body,
  reason (3–500), status ('pending'|'approved'|'rejected'),
  reviewed_by, reviewed_at, review_reason, created_at
  unique partial index: one 'pending' row per article_id

public.spotlight_edit_requests
  id, post_id → spotlight_posts, editor_id → profiles,
  title, description,
  reason, status, reviewed_by, reviewed_at, review_reason, created_at
  unique partial index: one 'pending' row per post_id
```

RLS: the request's own editor reads it; `is_moderator_or_admin()` reads all. Grants: `select` only —
no insert/update — so every state change goes through an RPC.

RPCs (all `security definer`, `set search_path = ''`, revoked then granted):

| Function | Guard | Effect |
|---|---|---|
| `submit_article_edit(p_article_id, p_title, p_excerpt, p_body, p_reason)` | author of record (`author_id` or `article_attributions`) **or** any reporter tier; article must be `published`; no existing pending request | inserts a `pending` row. **Never writes `articles`.** |
| `moderate_article_edit(p_request_id, p_decision, p_reason)` | `is_moderator_or_admin()`, reviewer ≠ editor | approve: apply title/excerpt/body to `articles`, write the before/after revision pair exactly as `admin_update_article` does, insert inline media, mark approved. reject: mark rejected with the reason. Both: `moderation_actions` + `admin_audit_log`. |
| `submit_spotlight_edit(p_post_id, p_title, p_description, p_reason)` | post author | inserts a `pending` row |
| `moderate_spotlight_edit(p_request_id, p_decision, p_reason)` | desk, reviewer ≠ editor | approve: apply title/description + `spotlight_post_media`, mark approved; reject: mark rejected |

`moderation_actions.action` gains `approve_article_edit`, `reject_article_edit`,
`approve_spotlight_edit`, `reject_spotlight_edit` (drop + re-add the `CHECK`).

`update_own_article(...)` is re-pointed to enqueue a request instead of writing live, so no existing
caller can still bypass approval. It is kept as a delegating wrapper rather than dropped, and the
name is noted as a follow-up rename.

---

## 5. File-level work plan

### Phase 0 — render Markdown everywhere (no schema change, no behaviour change)

| File | Change |
|---|---|
| `package.json` | add `react-markdown@^10`, `remark-gfm@^4`, `remark-breaks`, `turndown@^7`, `turndown-plugin-gfm@^1` |
| `components/ui/rich-text-content.tsx` | **new** — shared renderer; `img` override maps `/media/<id>` → `mediaUrlFor(id)` and adds a `<figcaption>` from the alt text; `table` override wraps in an overflow-x container |
| `app/news/[slug]/page.tsx` | render `article.body` through the renderer; keep `className="article-body"`; exclude inline-referenced ids from the gallery strip |
| `components/article/pending-article.tsx` | same renderer |
| `components/forum/spotlight-forum.tsx`, `app/spotlight/[id]/page.tsx` | same renderer for the description |
| `components/account/moderation-queue.tsx`, `admin-articles.tsx` | same renderer for review surfaces |
| `app/globals.css` | inside `@utility article-body`, add nested rules for `h2/h3`, `ul/ol`, `blockquote`, `hr`, `figure/figcaption`, and a `table` that scrolls in its own box (keeps `tests/overflow.test.mjs` green) |

Existing bodies render identically: they separate paragraphs with blank lines, which Markdown treats
as paragraphs.

### Phase 1 — composer: toolbar, paste conversion, insert image

| File | Change |
|---|---|
| `components/ui/rich-text-editor.tsx` | **new** — toolbar + textarea + live preview; `paste` → Turndown; exposes an imperative `insertAtCaret(text)` handle |
| `components/account/gallery-uploader.tsx` | add an optional `onInsert(item)` action per thumbnail ("লেখার মধ্যে বসান") that calls the editor's `insertAtCaret` with `![name](/media/<id>)`; keep upload, reorder and remove as they are. This *is* the "referencing option": an already-uploaded image is inserted by reference instead of uploaded again. |
| `components/account/writer-form.tsx` | replace the `<Textarea>` with the editor; wire the uploader's insert; keep every existing assertion (`clipboard.writeText`, `SITE_URL}/news/`, slug from response) |
| `components/forum/spotlight-forum.tsx` | same swap for the description, `scope="spotlight"` |

### Phase 2 — inline images reach the database

Migrations 1 and 2 above. This is what turns a written reference into a real, publicly gated image.

### Phase 3 — approval-gated edits

| File | Change |
|---|---|
| `supabase/migrations/202610130003_pending_content_edits.sql` | tables, RLS, grants, four RPCs, constraint values |
| `components/account/pending-edits.tsx` | **new** — the moderation section: pending article edits and Spotlight edits, current vs proposed rendered with the shared renderer, mandatory reason, approve/reject |
| `app/account/moderation/page.tsx` | render `<PendingEdits />` as the new section |
| `components/account/account-dashboard.tsx` | per-article "সম্পাদনার অনুরোধ" and per-post edit action → dialog with the editor + reason → `submit_article_edit` / `submit_spotlight_edit`; show "সংস্করণ অনুমোদনের অপেক্ষায়" while a request is pending |
| `components/account/article-edit-dialog.tsx` | **new** if the dashboard form is more than a few fields |

### Phase 4 — tests and docs

- `supabase/tests/dutimiz_rls.test.sql`: pgTAP assertions for the two request tables, the four RPCs,
  the self-approval refusal, "a pending request writes nothing to `articles`/`spotlight_posts`",
  inline media rows landing in `article_media`/`spotlight_post_media`, and an inline image becoming
  publicly resolvable only once published. **Bump `select plan(218)` to the new count.**
- `tests/ui-smoke.test.mjs`: source assertions for the new surfaces (editor in the composer,
  `PendingEdits` on the moderation page, the four RPCs referenced from the UI, no new
  `dangerouslySetInnerHTML`) and a guard that `derive_excerpt` strips Markdown.
- `README.md`: extend the writing, media and moderation sections.

---

## 6. Verification

| Step | Command | Notes |
|---|---|---|
| Types | `npm run check` | required |
| Worker | `npm run check:worker` | only if the worker is touched — the plan does not touch it |
| UI + static suite | `npm run test:ui` | builds in demo mode then runs `ui-smoke`, `overflow`, `media-worker-origin`, `pgtap-plan`, `cache-config`, `release-pipeline` |
| Database | `npm run test:db` | **CI only** — no local Docker/psql in this checkout, so it cannot be run here |

Plus manual passes that no test covers: paste a real Word document and a spreadsheet extract into the
composer and confirm the rendered output; place an image mid-text, publish, and open `/media/<id>` in
a private window; request an edit and confirm the live page is unchanged until approval; confirm a
moderator cannot approve their own request.

Where the static tests are the only local signal (pgTAP), the SQL is reviewed by hand against the
existing migration conventions and the gap is reported rather than claimed as passing.

---

## 7. Confirmed decisions

All three settled before implementation:

1. **Merged table cells flatten.** Markdown in the existing column; `colspan`/`rowspan` become
   ordinary cells. Word colours and fonts are not carried onto the site.
2. **Uploaded media only.** Inline images reference the author's own uploads — no external hosts, no
   URL-entry field in the composer.
3. **Every reporter tier may request an edit.** Junior, general and executive alike; all requests are
   approved by a moderator or admin. The desk's own console edit stays immediate and audited, and
   self-approval is refused.

---

## 8. Out of scope (noted, not built)

- Notifying the author when a request is approved or rejected (no notification system exists today).
- A word-level diff in the review view; Phase 3 shows current vs proposed side by side.
- `search_document` being re-pointed at a Markdown-stripped twin column. Markdown noise in the
  tsvector is harmless (`media`/UUID tokens rarely match a query), and re-pointing a stored generated
  column means dropping and rebuilding it — a follow-up if search quality ever regresses.
- Word-document *upload* (`.docx` in, Markdown out). Clipboard paste covers the stated requirement.
- Rich text in comments, bios and issue notes.
