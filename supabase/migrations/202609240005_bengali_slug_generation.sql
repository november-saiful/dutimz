begin;

-- Reporters never hand-type a URL slug; the Bengali headline is transliterated
-- into a Latin one. The old flow asked the browser for a slug and pre-filled it
-- by normalising the title and dropping everything outside [a-z0-9], which left
-- a Bengali-only headline with an empty value and made the required field
-- impossible to submit.
--
-- The romanisation is phonetic rather than literal. A Bengali consonant carries
-- an inherent "o" that disappears when a vowel sign follows, when a virama joins
-- it into a conjunct, or when it ends the word:
--     ঢাকা → dhaka      সংবাদ → songbad
--     সম্পাদকীয় → sompadiy
--
-- Characters that cluster with the nukta (U+09DC/DD/DF) and the structural marks
-- (virama, nukta, the two-part "o"/"au" vowel signs) are written as Unicode
-- escapes: Bengali gives several byte sequences for the same visual cluster, and
-- only the escapes are unambiguous about which one is meant.
create or replace function public.bengali_consonant(p_char text)
returns text
language sql immutable set search_path = '' as $$
  select case p_char
    when 'ক' then 'k' when 'খ' then 'kh' when 'গ' then 'g' when 'ঘ' then 'gh'
    when 'ঙ' then 'ng' when 'চ' then 'ch' when 'ছ' then 'chh' when 'জ' then 'j'
    when 'ঝ' then 'jh' when 'ঞ' then 'n' when 'ট' then 't' when 'ঠ' then 'th'
    when 'ড' then 'd' when 'ঢ' then 'dh' when 'ণ' then 'n' when 'ত' then 't'
    when 'থ' then 'th' when 'দ' then 'd' when 'ধ' then 'dh' when 'ন' then 'n'
    when 'প' then 'p' when 'ফ' then 'ph' when 'ব' then 'b' when 'ভ' then 'bh'
    when 'ম' then 'm' when 'য' then 'j' when 'র' then 'r' when 'ল' then 'l'
    when 'শ' then 'sh' when 'ষ' then 'sh' when 'স' then 's' when 'হ' then 'h'
    when U&'\09DC' then 'r'   -- ড়
    when U&'\09DD' then 'rh'  -- ঢ়
    when U&'\09DF' then 'y'   -- য়
    when U&'\09CE' then 't'   -- ৎ
    when U&'\09F0' then 'r'   -- ৰ
    when U&'\09F1' then 'w'   -- ৱ
    else null
  end
$$;

create or replace function public.bengali_vowel_sign(p_char text)
returns text
language sql immutable set search_path = '' as $$
  select case p_char
    when 'া' then 'a'
    when 'ি' then 'i'
    when 'ী' then 'i'
    when 'ু' then 'u'
    when 'ূ' then 'u'
    when 'ৃ' then 'ri'
    when 'ৄ' then 'ri'
    when 'ে' then 'e'
    when 'ৈ' then 'oi'
    when 'ো' then 'o'
    when 'ৌ' then 'ou'
    else null
  end
$$;

create or replace function public.bengali_vowel_letter(p_char text)
returns text
language sql immutable set search_path = '' as $$
  select case p_char
    when 'অ' then 'o' when 'আ' then 'a' when 'ই' then 'i' when 'ঈ' then 'i'
    when 'উ' then 'u' when 'ঊ' then 'u' when 'ঋ' then 'ri' when 'ঌ' then 'li'
    when 'এ' then 'e' when 'ঐ' then 'oi' when 'ও' then 'o' when 'ঔ' then 'ou'
    when U&'\09E0' then 'ri'
    when U&'\09E1' then 'li'
    when U&'\09BD' then ''    -- ঽ avagraha: written but silent
    else null
  end
$$;

create or replace function public.bengali_sign(p_char text)
returns text
language sql immutable set search_path = '' as $$
  select case p_char
    when 'ং' then 'ng'   -- anusvara
    when 'ঁ' then 'n'    -- candrabindu
    when 'ঃ' then 'h'    -- visarga
    else null
  end
$$;

create or replace function public.bengali_digit(p_char text)
returns text
language sql immutable set search_path = '' as $$
  select case p_char
    when '০' then '0' when '১' then '1' when '২' then '2' when '৩' then '3'
    when '৪' then '4' when '৫' then '5' when '৬' then '6' when '৭' then '7'
    when '৮' then '8' when '৯' then '9'
    else null
  end
$$;

-- Letters (but not digits) continue a word: the inherent vowel survives before
-- another consonant or a vowel sign, and is dropped before a space, a digit, or
-- the end of the title.
create or replace function public.bengali_letter(p_char text)
returns boolean
language sql immutable set search_path = '' as $$
  select p_char is not null
    and (public.bengali_consonant(p_char) is not null
      or public.bengali_vowel_sign(p_char) is not null
      or public.bengali_vowel_letter(p_char) is not null
      or public.bengali_sign(p_char) is not null)
$$;

create or replace function public.bengali_to_latin(p_text text)
returns text
language plpgsql immutable set search_path = '' as $$
declare
  source text := coalesce(p_text, '');
  total integer;
  position integer;
  previous text;
  current text;
  following text;
  result text := '';
begin
  -- Fold the equivalent encodings Unicode allows for the same cluster.
  source := replace(source, U&'\09C7' || U&'\09BE', U&'\09CB');  -- ে + া → ো
  source := replace(source, U&'\09C7' || U&'\09D7', U&'\09CC');  -- ে + ৗ → ৌ
  source := replace(source, 'ড' || U&'\09BC', U&'\09DC');
  source := replace(source, 'ঢ' || U&'\09BC', U&'\09DD');
  source := replace(source, 'য' || U&'\09BC', U&'\09DF');
  source := replace(source, U&'\09BC', '');                      -- stray nukta
  source := replace(source, U&'\0964', ' ');                     -- । word break
  total := length(source);

  for position in 1 .. total loop
    current := substr(source, position, 1);
    previous := case when position > 1 then substr(source, position - 1, 1) end;
    following := case when position < total then substr(source, position + 1, 1) end;

    if public.bengali_consonant(current) is not null then
      -- য inside a conjunct is a glide (দ্যা → dya), elsewhere it is the affricate.
      result := result || case
        when current = 'য' and previous = U&'\09CD' then 'y'
        else public.bengali_consonant(current)
      end;
      if following is not null
         and public.bengali_letter(following)
         and public.bengali_vowel_sign(following) is null then
        result := result || 'o';
      end if;
    elsif public.bengali_vowel_sign(current) is not null then
      result := result || public.bengali_vowel_sign(current);
    elsif public.bengali_digit(current) is not null then
      result := result || public.bengali_digit(current);
    elsif public.bengali_vowel_letter(current) is not null then
      result := result || public.bengali_vowel_letter(current);
    elsif public.bengali_sign(current) is not null then
      result := result || public.bengali_sign(current);
    elsif current in (U&'\09CD', U&'\09BC') then
      null;   -- virama joins clusters; a lone nukta carries no sound
    elsif current ~ '[A-Za-z0-9]' then
      result := result || lower(current);
    else
      result := result || ' ';   -- punctuation and symbols separate words
    end if;
  end loop;

  return trim(regexp_replace(result, '\s+', ' ', 'g'));
end;
$$;

-- Turn a headline into a slug that satisfies the articles.slug check
-- (^[a-z0-9]+(-[a-z0-9]+)*$), trimmed to a word boundary.
create or replace function public.slugify_title(p_title text)
returns text
language plpgsql immutable set search_path = '' as $$
declare
  slug text;
begin
  slug := trim(both '-' from regexp_replace(
    lower(public.bengali_to_latin(coalesce(p_title, ''))), '[^a-z0-9]+', '-', 'g'));
  if length(slug) > 96 then
    slug := regexp_replace(left(slug, 96), '-[^-]*$', '');
  end if;
  return slug;
end;
$$;

-- The slug a new article should claim: the transliterated title, or the next free
-- numeric suffix when that headline has been used before.
create or replace function public.allocate_article_slug(p_title text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  base text := nullif(public.slugify_title(p_title), '');
  suffix integer := 1;
  candidate text;
begin
  if base is null then base := 'report'; end if;   -- nothing transliterable
  candidate := base;
  while suffix < 60 and exists (select 1 from public.articles a where a.slug = candidate) loop
    suffix := suffix + 1;
    candidate := base || '-' || suffix::text;
  end loop;
  if suffix >= 60 then
    candidate := base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  end if;
  return candidate;
end;
$$;

-- submit_article no longer accepts a slug: the server derives it.
-- The parameter list keeps the same input types as before so that a
-- `create or replace` is impossible but the drop/create below is: the replaced
-- function still answers the old call shape, which keeps an already-deployed
-- bundle working in the window between the migration and the new deploy.
drop function public.submit_article(text, text, text, text, text, text);

create or replace function public.submit_article(
  p_category_slug text,
  p_title text,
  p_excerpt text,
  p_body text,
  p_hero_media_key text default null,
  -- Deprecated and ignored: reporters never supply a slug. Accepted only so a
  -- client built before this migration keeps submitting until it is replaced.
  p_slug text default null
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
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select role, reporter_tier into actor_role, actor_tier from public.user_roles where user_id = actor;
  if actor_role not in ('reporter', 'moderator', 'admin') then raise exception 'প্রতিবেদন জমা দিতে রিপোর্টার অনুমতি প্রয়োজন' using errcode = '42501'; end if;
  select id into category from public.categories where slug = p_category_slug and active;
  if category is null then raise exception 'সংবাদ বিভাগ পাওয়া যায়নি'; end if;

  -- Two reporters can submit the same headline at the same moment; the unique
  -- index is the real arbiter, so retry inside a subtransaction on conflict.
  loop
    attempt := attempt + 1;
    begin
      insert into public.articles (author_id, category_id, slug, title, excerpt, body, hero_media_key, status, published_at)
        values (
          actor, category, public.allocate_article_slug(p_title), trim(p_title), trim(p_excerpt), trim(p_body),
          nullif(trim(p_hero_media_key), ''),
          case when actor_role = 'reporter' and actor_tier = 'junior' then 'pending'::public.article_status else 'published'::public.article_status end,
          case when actor_role = 'reporter' and actor_tier = 'junior' then null else now() end
        ) returning * into created;
      exit;
    exception when unique_violation then
      if attempt >= 4 then raise; end if;
    end;
  end loop;

  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason)
    values (created.id, actor, 1, created.title, created.excerpt, created.body, 'প্রাথমিক জমা');
  if created.status = 'published' then perform public.add_article_earning(created.id, actor); end if;
  return created;
end;
$$;

-- Pure text helpers: readable to signed-in users so the editor can preview the
-- address live, and harmless because they touch no data.
revoke all on function public.bengali_consonant(text) from public, anon;
revoke all on function public.bengali_vowel_sign(text) from public, anon;
revoke all on function public.bengali_vowel_letter(text) from public, anon;
revoke all on function public.bengali_sign(text) from public, anon;
revoke all on function public.bengali_digit(text) from public, anon;
revoke all on function public.bengali_letter(text) from public, anon;
revoke all on function public.bengali_to_latin(text) from public, anon;
revoke all on function public.slugify_title(text) from public, anon;
grant execute on function public.bengali_consonant(text), public.bengali_vowel_sign(text),
  public.bengali_vowel_letter(text), public.bengali_sign(text), public.bengali_digit(text),
  public.bengali_letter(text), public.bengali_to_latin(text), public.slugify_title(text)
  to authenticated;

-- Slug allocation stays internal: only the audited article functions claim one.
revoke all on function public.allocate_article_slug(text) from public, anon, authenticated;

revoke all on function public.submit_article(text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_article(text, text, text, text, text, text) to authenticated;

commit;
