-- The formula that replaces the manual award button.
--
-- Three functions measure an article (words, questionnaire completeness, the full formula), a
-- deferred constraint trigger credits it the moment its status commits as `published`, and one RPC
-- records a reader's view. The trigger is deferred because every publish path inserts the article
-- row before its gallery rows and questionnaire response; by commit time all of them are visible.
--
-- `admin_award_article` is retired: the desk no longer prices stories by hand. Corrections stay
-- possible through `admin_adjust_balance`, which is deliberately left alone.
begin;

-- The word count a formula bonus is based on. Markdown is stripped with the same rules
-- `derive_excerpt` uses, then whitespace tokens are counted. Bengali runs have no word spaces, so
-- a token's Bengali characters are counted at six per word while its Latin/digit part — already
-- space-separated — contributes one.
create or replace function public.article_word_count(p_body text)
returns integer
language sql immutable set search_path = '' as $$
  with stripped as (
    select btrim(regexp_replace(
             regexp_replace(
              regexp_replace(
               regexp_replace(
                regexp_replace(
                 regexp_replace(
                  regexp_replace(
                   regexp_replace(
                    regexp_replace(
                     regexp_replace(
                      regexp_replace(
                       regexp_replace(coalesce(p_body, ''),
                         '!\[[^\]]*\]\([^)]*\)', '', 'g'),
                       '\[([^\]]*)\]\([^)]*\)', '\1', 'g'),
                      '\[([^\]]*)\]\[[^\]]*\]', '\1', 'g'),
                     '^[ \t]{0,3}#{1,6}[ \t]+', '', 'gn'),
                    '^[ \t]{0,3}>[ \t]?', '', 'gn'),
                   '^[ \t]{0,3}[-*+][ \t]+', '', 'gn'),
                  '^[ \t]{0,3}[0-9]{1,9}\.[ \t]+', '', 'gn'),
                 '^[ \t]*\|?[ \t:|-]+\|?[ \t]*$', ' ', 'gn'),
                '\|', ' ', 'g'),
               '\*\*|__|~~|`', '', 'g'),
              '\*', '', 'g'),
             '\s+', ' ', 'g')) as prose
  )
  select coalesce(sum(
    case
      when tok.bengali = 0 then 1
      else ceil(tok.bengali / 6.0)::integer
           + case when tok.token_length > tok.bengali then 1 else 0 end
    end), 0)::integer
    from stripped
    cross join lateral regexp_split_to_table(stripped.prose, ' ') as split(token)
    cross join lateral (
      select length(split.token) as token_length,
             length(regexp_replace(split.token, '[^ঀ-৿]', '', 'g')) as bengali
    ) tok
   where split.token <> '';
$$;

-- Whether the article answered every question its questionnaire version showed it. The walk
-- mirrors `validate_article_questionnaire_answers` (same condition semantics), but nothing is
-- "optional": every visible field must carry a non-empty answer. An unanswered questionnaire row
-- is false.
create or replace function public.article_questionnaire_complete(p_article_id uuid)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  questionnaire jsonb;
  answers jsonb;
  field jsonb;
  condition jsonb;
  option_value text;
  field_id text;
  visible boolean;
  condition_match boolean;
  parent_is_visible boolean;
  visible_ids text[] := '{}';
  answer jsonb;
  non_empty boolean;
begin
  select qv.schema, r.answers into questionnaire, answers
    from public.article_questionnaire_responses r
    join public.article_questionnaire_versions qv on qv.id = r.questionnaire_version_id
   where r.article_id = p_article_id;
  if questionnaire is null then return false; end if;
  answers := coalesce(answers, '{}'::jsonb);
  for field in select value from jsonb_array_elements(questionnaire) loop
    field_id := field->>'id';
    answer := answers->field_id;
    visible := true;
    if jsonb_array_length(coalesce(field->'conditions', '[]'::jsonb)) > 0 then
      visible := coalesce(field->>'conditionMode', 'any') = 'all';
      for condition in select value from jsonb_array_elements(field->'conditions') loop
        condition_match := false;
        parent_is_visible := (condition->>'fieldId') = any(visible_ids);
        if parent_is_visible then
          for option_value in select jsonb_array_elements_text(coalesce(condition->'values', '[]'::jsonb)) loop
            if answers->(condition->>'fieldId') = to_jsonb(option_value)
               or (jsonb_typeof(answers->(condition->>'fieldId')) = 'array'
                   and answers->(condition->>'fieldId') ? option_value) then
              condition_match := true;
              exit;
            end if;
          end loop;
        end if;
        if coalesce(field->>'conditionMode', 'any') = 'all' then visible := visible and condition_match;
        else visible := visible or condition_match;
        end if;
      end loop;
    end if;
    if not visible then continue; end if;
    visible_ids := array_append(visible_ids, field_id);
    non_empty := false;
    if field->>'type' = 'single' then
      non_empty := jsonb_typeof(answer) = 'string' and char_length(answer #>> '{}') > 0;
    elsif field->>'type' = 'multi' then
      non_empty := jsonb_typeof(answer) = 'array' and jsonb_array_length(answer) > 0;
    elsif field->>'type' in ('text', 'textarea') then
      non_empty := jsonb_typeof(answer) = 'string' and char_length(btrim(answer #>> '{}')) > 0;
    elsif field->>'type' = 'number' then
      non_empty := jsonb_typeof(answer) = 'number';
    elsif field->>'type' = 'people' then
      non_empty := jsonb_typeof(answer) = 'object' and coalesce((answer->>'count')::integer, 0) > 0;
    end if;
    if not non_empty then return false; end if;
  end loop;
  return true;
end;
$$;

-- The whole formula for one article. `details` records every component so the writer's balance
-- page and the desk's console can show exactly how a number was reached.
create or replace function public.compute_article_earning(p_article_id uuid)
returns table (amount_tk numeric, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  target public.articles;
  crime_bonus numeric := 0;
  word_bonus numeric := 0;
  word_count integer := 0;
  hero_bonus numeric := 0;
  gallery_count integer := 0;
  gallery_bonus numeric := 0;
  interview_bonus numeric := 0;
  questionnaire_bonus numeric := 0;
  base_amount numeric := 25;
begin
  select * into target from public.articles where id = p_article_id;
  if target.id is null then raise exception 'প্রতিবেদন পাওয়া যায়নি'; end if;
  if exists (select 1 from public.categories c where c.id = target.category_id and c.slug = 'crime') then
    crime_bonus := 10;
  end if;
  word_count := public.article_word_count(target.body);
  if word_count > 150 then word_bonus := 10 * ceil((word_count - 150) / 100.0); end if;
  if target.hero_media_key is not null then hero_bonus := 2; end if;
  -- The hero earns its own +2; the gallery tiers count only the extra images.
  select count(*) into gallery_count
    from public.article_media am
   where am.article_id = p_article_id and am.is_gallery
     and am.media_id::text is distinct from target.hero_media_key;
  gallery_bonus := least(gallery_count, 5) * 2
                 + least(greatest(gallery_count - 5, 0), 5) * 1
                 + greatest(gallery_count - 10, 0) * 0.5;
  if target.interview_kind = 'virtual' then interview_bonus := 10;
  elsif target.interview_kind = 'in-person' then interview_bonus := 20;
  end if;
  if public.article_questionnaire_complete(p_article_id) then questionnaire_bonus := 1; end if;
  amount_tk := base_amount + crime_bonus + word_bonus + hero_bonus + gallery_bonus + interview_bonus + questionnaire_bonus;
  details := jsonb_build_object(
    'version', 1,
    'base', base_amount,
    'crime', crime_bonus,
    'words', jsonb_build_object('count', word_count, 'bonus', word_bonus),
    'hero', hero_bonus,
    'gallery', jsonb_build_object('count', gallery_count, 'bonus', gallery_bonus),
    'interview', jsonb_build_object('kind', target.interview_kind, 'bonus', interview_bonus),
    'questionnaire', questionnaire_bonus,
    'total', amount_tk
  );
  return next;
end;
$$;

-- The one door every publish path passes through. Junior drafts award on approval, direct
-- publishes award on submission, and the unique `one_article_fee_per_article` index makes the
-- credit exactly once no matter how many times a story crosses the published boundary.
create or replace function public.award_article_earning()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  entry public.ledger_entry_type;
  computed_amount numeric;
  computed_details jsonb;
begin
  if new.status <> 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return new; end if;
  owner_id := coalesce(new.author_id,
    (select aa.author_id from public.article_attributions aa where aa.article_id = new.id));
  if owner_id is null then return new; end if;
  select c.amount_tk, c.details into computed_amount, computed_details
    from public.compute_article_earning(new.id) c;
  entry := case when public.profile_completion_for(owner_id) = 100
           then 'article_earning_available'::public.ledger_entry_type
           else 'article_earning_held'::public.ledger_entry_type end;
  insert into public.earnings_ledger (user_id, article_id, entry_type, amount_tk, details, reporter_tier_snapshot)
  values (owner_id, new.id, entry, computed_amount, computed_details,
          (select r.reporter_tier from public.user_roles r where r.user_id = owner_id))
  on conflict (article_id) where entry_type in ('article_earning_available', 'article_earning_held') do nothing;
  return new;
end;
$$;
create constraint trigger award_article_earning_on_publish
  after insert or update of status on public.articles
  deferrable initially deferred
  for each row execute function public.award_article_earning();

-- A reader's view of one published story. The only identity kept is a salted hash (never the raw
-- IP or token); the unique per-day row is the fair-play guard, and the advisory lock makes the
-- 1,000-views-a-day cap exact under concurrency. The author's own signed-in visits never count.
create or replace function public.record_article_view(p_article_id uuid, p_viewer_ip text, p_viewer_token text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.articles;
  viewer uuid := (select auth.uid());
  owner_id uuid;
  viewer_hash text;
  view_count integer;
begin
  if btrim(coalesce(p_viewer_token, '')) = '' then return; end if;
  select * into target from public.articles where id = p_article_id;
  if target.id is null or target.status <> 'published' then return; end if;
  owner_id := coalesce(target.author_id,
    (select aa.author_id from public.article_attributions aa where aa.article_id = p_article_id));
  if viewer is not null and viewer = owner_id then return; end if;
  perform pg_advisory_xact_lock(hashtext('article_view_cap:' || p_article_id::text));
  select count(*) into view_count from public.article_views
   where article_id = p_article_id and view_day = timezone('Asia/Dhaka', now())::date;
  if view_count >= 1000 then return; end if;
  viewer_hash := md5(coalesce(p_viewer_ip, '') || ':' || p_viewer_token);
  insert into public.article_views (article_id, viewer_hash)
  values (p_article_id, viewer_hash)
  on conflict do nothing;
end;
$$;

-- The manual award button goes away; the trigger above is the only way an article earns.
drop function if exists public.admin_award_article(uuid, integer);

revoke all on function public.article_word_count(text) from public, anon;
grant execute on function public.article_word_count(text) to authenticated;
revoke all on function public.article_questionnaire_complete(uuid) from public, anon;
grant execute on function public.article_questionnaire_complete(uuid) to authenticated;
revoke all on function public.compute_article_earning(uuid) from public, anon;
grant execute on function public.compute_article_earning(uuid) to authenticated;
revoke all on function public.award_article_earning() from public, anon, authenticated;
revoke all on function public.record_article_view(uuid, text, text) from public;
grant execute on function public.record_article_view(uuid, text, text) to anon, authenticated;

commit;
