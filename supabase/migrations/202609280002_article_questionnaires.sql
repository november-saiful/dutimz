begin;

create table public.article_questionnaire_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  schema jsonb not null check (jsonb_typeof(schema) = 'array'),
  active boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index article_questionnaire_one_active_idx on public.article_questionnaire_versions (active) where active;

create table public.article_questionnaire_responses (
  article_id uuid primary key references public.articles(id) on delete cascade,
  questionnaire_version_id uuid not null references public.article_questionnaire_versions(id) on delete restrict,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.article_questionnaire_versions enable row level security;
alter table public.article_questionnaire_responses enable row level security;
revoke all on public.article_questionnaire_versions, public.article_questionnaire_responses from anon, authenticated;
grant select on public.article_questionnaire_versions, public.article_questionnaire_responses to authenticated;
create policy questionnaire_versions_admin_read on public.article_questionnaire_versions
  for select to authenticated using ((select public.is_admin()));
create policy questionnaire_responses_admin_read on public.article_questionnaire_responses
  for select to authenticated using ((select public.is_admin()));

insert into public.article_questionnaire_versions (version, schema, active) values (1, $schema$[
  {"id":"verification_status","label":"তথ্যের যাচাইয়ের অবস্থা কী?","type":"single","required":true,"options":["প্রাথমিক তথ্য — স্বাধীনভাবে যাচাই হয়নি","একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","সরকারি নথি বা কর্তৃপক্ষের বক্তব্যে নিশ্চিত"]},
  {"id":"verification_notes","label":"যাচাইয়ের সূত্র বা বিবরণ","type":"textarea","required":true},
  {"id":"criminal_activity","label":"এটি কি অপরাধমূলক কার্যকলাপের অভিযোগ?","type":"single","required":true,"options":["হ্যাঁ","না"]},
  {"id":"crime_type","label":"কী ধরনের অপরাধের অভিযোগ?","type":"multi","required":true,"options":["হত্যা","অ-প্রাণঘাতী আঘাত","সম্পত্তির ক্ষতি","অহিংস অপরাধ","হয়রানি","অন্যান্য অপরাধ"],"conditions":[{"fieldId":"criminal_activity","values":["হ্যাঁ"]}]},
  {"id":"harassment_type","label":"হয়রানিটি কি যৌন?","type":"single","required":true,"options":["যৌন হয়রানি","অযৌন হয়রানি"],"conditions":[{"fieldId":"crime_type","values":["হয়রানি"]}]},
  {"id":"victims","label":"ভুক্তভোগীর তথ্য","type":"people","required":true,"countLabel":"ভুক্তভোগীর সংখ্যা (অজানা হলে ০)","conditions":[{"fieldId":"crime_type","values":["হত্যা"]},{"fieldId":"crime_type","values":["অ-প্রাণঘাতী আঘাত"]},{"fieldId":"harassment_type","values":["যৌন হয়রানি"]},{"fieldId":"harassment_type","values":["অযৌন হয়রানি"]}],"personFields":[{"id":"name","label":"নাম (নির্ভরযোগ্য সূত্রে নিশ্চিত হলে)","type":"text"},{"id":"gender","label":"লিঙ্গ","type":"single","options":["নারী","পুরুষ","অন্যান্য","জানা নেই"]},{"id":"session","label":"শিক্ষাবর্ষ / সেশন","type":"text"},{"id":"identification","label":"অন্যান্য পরিচিতি (সংবেদনশীল তথ্য নয়)","type":"text"}]},
  {"id":"property_type","label":"কোন সম্পত্তির ক্ষতি হয়েছে?","type":"multi","required":true,"options":["সড়ক","বাড়ি","একাডেমিক ভবন","ক্যাম্পাসের অন্যান্য ভবন","যানবাহন","দোকান","গাছপালা","অন্যান্য সম্পত্তি"],"conditions":[{"fieldId":"crime_type","values":["সম্পত্তির ক্ষতি"]}]},
  {"id":"crime_details","label":"অপরাধের সংক্ষিপ্ত বিবরণ","type":"textarea","required":true,"conditions":[{"fieldId":"criminal_activity","values":["হ্যাঁ"]}]},
  {"id":"crime_location","label":"ঘটনার স্থান","type":"text","required":false,"conditions":[{"fieldId":"criminal_activity","values":["হ্যাঁ"]}]},
  {"id":"crime_time","label":"ঘটনার তারিখ বা সময়","type":"text","required":false,"conditions":[{"fieldId":"criminal_activity","values":["হ্যাঁ"]}]},
  {"id":"property_details","label":"ক্ষতিগ্রস্ত সম্পত্তি ও ক্ষতির বিবরণ","type":"textarea","required":true,"conditions":[{"fieldId":"crime_type","values":["সম্পত্তির ক্ষতি"]}]},
  {"id":"suspects","label":"অভিযুক্ত ব্যক্তিদের তথ্য (অভিযোগ প্রমাণিত না-ও হতে পারে)","type":"people","required":true,"countLabel":"অভিযুক্তের সংখ্যা (অজানা হলে ০)","conditions":[{"fieldId":"criminal_activity","values":["হ্যাঁ"]}],"personFields":[{"id":"name","label":"নাম (নির্ভরযোগ্য সূত্রে নিশ্চিত হলে)","type":"text"},{"id":"gender","label":"লিঙ্গ","type":"single","options":["নারী","পুরুষ","অন্যান্য","জানা নেই"]},{"id":"session","label":"শিক্ষাবর্ষ / সেশন","type":"text"},{"id":"identification","label":"অন্যান্য পরিচিতি (সংবেদনশীল তথ্য নয়)","type":"text"}]},
  {"id":"activity_type","label":"কার্যকলাপের ধরন কী?","type":"single","required":true,"options":["প্রতিবাদ","রাজনৈতিক আন্দোলন","মতামত","সংস্কার","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা","গবেষণা প্রকাশনা","অন্যান্য"],"conditions":[{"fieldId":"criminal_activity","values":["না"]}]},
  {"id":"activity_details","label":"কার্যকলাপের বিবরণ","type":"textarea","required":true,"conditions":[{"fieldId":"activity_type","values":["প্রতিবাদ","রাজনৈতিক আন্দোলন","মতামত","সংস্কার","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা","গবেষণা প্রকাশনা","অন্যান্য"]}]},
  {"id":"activity_participants","label":"অংশগ্রহণকারীর সংখ্যা","type":"number","required":false,"conditions":[{"fieldId":"activity_type","values":["প্রতিবাদ","রাজনৈতিক আন্দোলন","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা","গবেষণা প্রকাশনা"]}]},
  {"id":"activity_location","label":"স্থান","type":"text","required":false,"conditions":[{"fieldId":"activity_type","values":["প্রতিবাদ","রাজনৈতিক আন্দোলন","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা"]}]},
  {"id":"activity_organizer","label":"আয়োজক বা সংশ্লিষ্ট সংগঠন","type":"text","required":false,"conditions":[{"fieldId":"activity_type","values":["প্রতিবাদ","রাজনৈতিক আন্দোলন","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা","গবেষণা প্রকাশনা"]}]},
  {"id":"activity_time","label":"কার্যক্রমের তারিখ বা সময়","type":"text","required":false,"conditions":[{"fieldId":"activity_type","values":["প্রতিবাদ","রাজনৈতিক আন্দোলন","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা","গবেষণা প্রকাশনা"]}]},
  {"id":"activity_outcome","label":"ফলাফল বা পরবর্তী পদক্ষেপ","type":"textarea","required":false,"conditions":[{"fieldId":"activity_type","values":["প্রতিবাদ","রাজনৈতিক আন্দোলন","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা","গবেষণা প্রকাশনা"]}]}
]$schema$::jsonb, true);

create or replace function public.get_active_article_questionnaire()
returns table (id uuid, version integer, schema jsonb)
language sql stable security definer set search_path = '' as $$
  select q.id, q.version, q.schema from public.article_questionnaire_versions q where q.active limit 1
$$;

create or replace function public.validate_article_questionnaire_answers(p_version_id uuid, p_answers jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  questionnaire jsonb;
  field jsonb;
  condition jsonb;
  answer jsonb;
  condition_answer jsonb;
  option_value text;
  field_id text;
  visible boolean;
  condition_match boolean;
  parent_is_visible boolean;
  visible_ids text[] := '{}';
  person jsonb;
  person_field jsonb;
  person_count integer;
  top_level_id text;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 131072 then
    raise exception 'প্রশ্নোত্তরের তথ্য সঠিক নয় বা নির্ধারিত সীমার চেয়ে বড়';
  end if;
  select q.schema into questionnaire from public.article_questionnaire_versions q where q.id = p_version_id;
  if questionnaire is null then raise exception 'প্রশ্নমালার সংস্করণ পাওয়া যায়নি'; end if;

  for field_id in select jsonb_object_keys(p_answers) loop
    if not exists (select 1 from jsonb_array_elements(questionnaire) as f(value) where f.value->>'id' = field_id) then
      raise exception 'প্রশ্নমালায় নেই এমন উত্তর পাঠানো হয়েছে';
    end if;
  end loop;

  visible_ids := '{}';
  for field in select value from jsonb_array_elements(questionnaire) loop
    field_id := field->>'id';
    answer := p_answers->field_id;
    visible := true;
    if jsonb_array_length(coalesce(field->'conditions', '[]'::jsonb)) > 0 then
      visible := coalesce(field->>'conditionMode', 'any') = 'all';
      for condition in select value from jsonb_array_elements(field->'conditions') loop
        condition_answer := p_answers->(condition->>'fieldId');
        parent_is_visible := (condition->>'fieldId') = any(visible_ids);
        condition_match := false;
        if parent_is_visible then
          for option_value in select jsonb_array_elements_text(coalesce(condition->'values', '[]'::jsonb)) loop
            if condition_answer = to_jsonb(option_value)
               or (jsonb_typeof(condition_answer) = 'array' and condition_answer ? option_value) then
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
    if not visible then
      if p_answers ? field_id then raise exception 'প্রযোজ্য নয় এমন প্রশ্নের উত্তর পাঠানো হয়েছে'; end if;
      continue;
    end if;
    visible_ids := array_append(visible_ids, field_id);
    if coalesce((field->>'required')::boolean, false) and
       (answer is null or answer = 'null'::jsonb or answer = '""'::jsonb or answer = '[]'::jsonb) then
      raise exception 'আবশ্যক প্রশ্নের উত্তর দিন: %', field->>'label';
    end if;
    if answer is null or answer = 'null'::jsonb then continue; end if;
    if field->>'type' = 'single' then
      if jsonb_typeof(answer) <> 'string' or not (coalesce(field->'options', '[]'::jsonb) ? (answer #>> '{}')) then raise exception 'নির্বাচিত উত্তরটি সঠিক নয়: %', field->>'label'; end if;
    elsif field->>'type' = 'multi' then
      if jsonb_typeof(answer) <> 'array' then raise exception 'এক বা একাধিক উত্তর নির্বাচন করুন: %', field->>'label'; end if;
      if coalesce((field->>'required')::boolean, false) and jsonb_array_length(answer) = 0 then raise exception 'অন্তত একটি উত্তর নির্বাচন করুন: %', field->>'label'; end if;
      for option_value in select jsonb_array_elements_text(answer) loop
        if not (coalesce(field->'options', '[]'::jsonb) ? option_value) then raise exception 'নির্বাচিত উত্তরটি সঠিক নয়: %', field->>'label'; end if;
      end loop;
    elsif field->>'type' in ('text', 'textarea') then
      if jsonb_typeof(answer) <> 'string' or char_length(answer #>> '{}') > 3000 then raise exception 'লেখার উত্তরটি সঠিক নয়: %', field->>'label'; end if;
    elsif field->>'type' = 'number' then
      if jsonb_typeof(answer) <> 'number' or (answer #>> '{}')::numeric < 0 or (answer #>> '{}')::numeric > 10000000 or (answer #>> '{}')::numeric % 1 <> 0 then raise exception 'সংখ্যাটি সঠিক নয়: %', field->>'label'; end if;
    elsif field->>'type' = 'people' then
      if jsonb_typeof(answer) <> 'object' or not (answer ? 'count') or not (answer ? 'people')
         or jsonb_typeof(answer->'count') is distinct from 'number'
         or jsonb_typeof(answer->'people') is distinct from 'array'
         or coalesce(answer->>'count', '') !~ '^[0-9]{1,3}$' then
        raise exception 'ব্যক্তির তথ্য সঠিক নয়: %', field->>'label';
      end if;
      for top_level_id in select jsonb_object_keys(answer) loop
        if top_level_id not in ('count', 'people') then raise exception 'ব্যক্তির তালিকায় অনুমোদিত নয় এমন তথ্য পাঠানো হয়েছে'; end if;
      end loop;
      person_count := (answer->>'count')::integer;
      if person_count < 0 or person_count > 100 or jsonb_array_length(answer->'people') <> person_count then raise exception 'ব্যক্তির সংখ্যা ও বিবরণ মিলছে না: %', field->>'label'; end if;
      for person in select value from jsonb_array_elements(answer->'people') loop
        if jsonb_typeof(person) <> 'object' then raise exception 'ব্যক্তির পরিচিতি সঠিক নয়'; end if;
        if not exists (
          select 1 from jsonb_array_elements(coalesce(field->'personFields','[]'::jsonb)) as pf(value)
           where nullif(btrim(person->>(pf.value->>'id')), '') is not null
        ) then raise exception 'প্রতিটি ব্যক্তির অন্তত একটি পরিচিতি লিখুন: %', field->>'label'; end if;
        for field_id in select jsonb_object_keys(person) loop
          if not exists (select 1 from jsonb_array_elements(coalesce(field->'personFields','[]'::jsonb)) as pf(value) where pf.value->>'id' = field_id) then raise exception 'অনুমোদিত নয় এমন ব্যক্তিগত তথ্য পাঠানো হয়েছে'; end if;
        end loop;
        for person_field in select value from jsonb_array_elements(coalesce(field->'personFields', '[]'::jsonb)) loop
          if person ? (person_field->>'id') and jsonb_typeof(person->(person_field->>'id')) <> 'string' then raise exception 'ব্যক্তির পরিচিতি সঠিক নয়'; end if;
          if char_length(coalesce(person->>(person_field->>'id'), '')) > 500 then raise exception 'ব্যক্তির পরিচিতি নির্ধারিত সীমার চেয়ে বড়'; end if;
          if person_field->>'type' = 'single' and person ? (person_field->>'id')
             and not (coalesce(person_field->'options','[]'::jsonb) ? (person->>(person_field->>'id'))) then raise exception 'ব্যক্তির নির্বাচিত পরিচিতি সঠিক নয়'; end if;
        end loop;
      end loop;
    else
      raise exception 'প্রশ্নের ধরনটি সমর্থিত নয়';
    end if;
  end loop;
  return p_answers;
end;
$$;

create or replace function public.save_article_questionnaire(p_schema jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  field jsonb;
  condition jsonb;
  person_field jsonb;
  field_id text;
  next_version integer;
  field_position integer := 0;
  parent_position integer;
  option_value text;
  unique_option_count integer;
  unique_person_option_count integer;
begin
  if not public.is_admin() then raise exception 'শুধু প্রশাসক প্রশ্নমালা সম্পাদনা করতে পারবেন' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('article_questionnaire_version'));
  if p_schema is null or jsonb_typeof(p_schema) is distinct from 'array' then raise exception 'প্রশ্নমালাটি সঠিক তালিকা নয়'; end if;
  if jsonb_array_length(p_schema) < 1 or jsonb_array_length(p_schema) > 60 or pg_column_size(p_schema) > 65536 then raise exception 'প্রশ্নমালায় ১ থেকে ৬০টি প্রশ্ন রাখুন এবং নির্ধারিত তথ্যসীমার মধ্যে রাখুন'; end if;
  if (select count(*) from jsonb_array_elements(p_schema) as field(value) where field.value ? 'conditions' and field.value ? 'conditionMode' and field.value->>'conditionMode' not in ('any','all')) > 0 then raise exception 'প্রশ্নের শর্তের ধরন any অথবা all হতে হবে'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_schema)) <> jsonb_array_length(p_schema) then raise exception 'প্রতিটি প্রশ্নের আলাদা পরিচিতি থাকতে হবে'; end if;
  for field in select value from jsonb_array_elements(p_schema) loop
    field_id := field->>'id';
    if jsonb_typeof(field) is distinct from 'object' or coalesce(field_id,'') !~ '^[a-z][a-z0-9_]{1,59}$' or char_length(coalesce(field->>'label','')) not between 2 and 160 then raise exception 'প্রশ্নের পরিচিতি বা শিরোনাম সঠিক নয়'; end if;
    if coalesce(field->>'type','') not in ('single','multi','text','textarea','number','people') then raise exception 'প্রশ্নের ধরন সঠিক নয়'; end if;
    if jsonb_typeof(coalesce(field->'required','false'::jsonb)) <> 'boolean' or coalesce(field->>'conditionMode','any') not in ('any','all') then raise exception 'প্রশ্নের শর্ত বা আবশ্যকতার ধরন সঠিক নয়'; end if;
    if field->>'type' in ('single','multi') then
      if jsonb_typeof(field->'options') is distinct from 'array' then raise exception 'নির্বাচনী প্রশ্নে বিকল্পের তালিকা দিন'; end if;
      if jsonb_array_length(field->'options') < 2 or jsonb_array_length(field->'options') > 40 then raise exception 'নির্বাচনী প্রশ্নে ২ থেকে ৪০টি বিকল্প দিন'; end if;
      if exists (select 1 from jsonb_array_elements(field->'options') as option_row(value) where jsonb_typeof(option_row.value) is distinct from 'string') then raise exception 'প্রতিটি বিকল্প লেখা হিসেবে দিতে হবে'; end if;
      select count(distinct option_row.value) into unique_option_count from jsonb_array_elements_text(field->'options') as option_row(value);
      if unique_option_count <> jsonb_array_length(field->'options') then raise exception 'বিকল্পগুলো পুনরাবৃত্ত হতে পারবে না'; end if;
      for option_value in select jsonb_array_elements_text(field->'options') loop
        if char_length(option_value) not between 1 and 120 then raise exception 'প্রতিটি বিকল্প ১ থেকে ১২০ অক্ষরের মধ্যে লিখুন'; end if;
      end loop;
    elsif field->>'type' in ('text','textarea') and (field ? 'options' or field ? 'personFields') then
      raise exception 'লেখার প্রশ্নে বিকল্প বা ব্যক্তির ঘর দেওয়া যাবে না';
    end if;
    if jsonb_typeof(coalesce(field->'conditions','[]'::jsonb)) is distinct from 'array' then raise exception 'শর্তের তালিকা সঠিক নয়'; end if;
    if jsonb_array_length(coalesce(field->'conditions','[]'::jsonb)) > 8 then raise exception 'শর্তের তালিকা সঠিক নয়'; end if;
    if field->>'type' = 'people' then
      if jsonb_typeof(field->'personFields') is distinct from 'array' then raise exception 'ব্যক্তির পরিচিতির ঘরগুলো সঠিক নয়'; end if;
      if jsonb_array_length(field->'personFields') < 1 or jsonb_array_length(field->'personFields') > 12 then raise exception 'ব্যক্তির পরিচিতির ঘরগুলো সঠিক নয়'; end if;
      if exists (select 1 from jsonb_array_elements(field->'personFields') as pf(value) where jsonb_typeof(pf.value) is distinct from 'object') then raise exception 'ব্যক্তির পরিচিতির ঘরগুলো সঠিক নয়'; end if;
      if (select count(distinct pf.value->>'id') from jsonb_array_elements(field->'personFields') as pf(value)) <> jsonb_array_length(field->'personFields') then raise exception 'ব্যক্তির প্রতিটি পরিচিতি ঘরের আলাদা পরিচিতি থাকতে হবে'; end if;
      for person_field in select value from jsonb_array_elements(field->'personFields') loop
        if coalesce(person_field->>'id','') !~ '^[a-z][a-z0-9_]{0,39}$' or char_length(coalesce(person_field->>'label','')) not between 1 and 100 or coalesce(person_field->>'type','') not in ('text','single') then raise exception 'ব্যক্তির পরিচিতির ঘর সঠিক নয়'; end if;
        if person_field->>'type' = 'single' then
          if jsonb_typeof(person_field->'options') is distinct from 'array' then raise exception 'ব্যক্তির নির্বাচনী পরিচিতির বিকল্প সঠিক নয়'; end if;
          if jsonb_array_length(person_field->'options') < 2 or jsonb_array_length(person_field->'options') > 20 then raise exception 'ব্যক্তির নির্বাচনী পরিচিতির বিকল্প সঠিক নয়'; end if;
          if exists (select 1 from jsonb_array_elements(person_field->'options') as option_row(value) where jsonb_typeof(option_row.value) is distinct from 'string') then raise exception 'ব্যক্তির প্রতিটি বিকল্প লেখা হিসেবে দিতে হবে'; end if;
          select count(distinct option_row.value) into unique_person_option_count from jsonb_array_elements_text(person_field->'options') as option_row(value);
          if unique_person_option_count <> jsonb_array_length(person_field->'options') then raise exception 'ব্যক্তির বিকল্পগুলো পুনরাবৃত্ত হতে পারবে না'; end if;
        elsif person_field ? 'options' then raise exception 'লেখার পরিচিতি ঘরে বিকল্প দেওয়া যাবে না'; end if;
      end loop;
    end if;
  end loop;
  for field in select value from jsonb_array_elements(p_schema) loop
    select ord::integer into field_position from jsonb_array_elements(p_schema) with ordinality as e(value, ord) where value->>'id' = field->>'id';
    for condition in select value from jsonb_array_elements(coalesce(field->'conditions','[]'::jsonb)) loop
      select ord::integer into parent_position from jsonb_array_elements(p_schema) with ordinality as e(value, ord) where value->>'id' = condition->>'fieldId';
      if parent_position is null or parent_position >= field_position or jsonb_typeof(condition->'values') is distinct from 'array' then raise exception 'শর্তের প্রশ্ন বা উত্তর সঠিক নয়'; end if;
      if jsonb_array_length(condition->'values') = 0 then raise exception 'শর্তের প্রশ্ন বা উত্তর সঠিক নয়'; end if;
      if exists (select 1 from jsonb_array_elements(condition->'values') as selected_value(value) where jsonb_typeof(selected_value.value) is distinct from 'string') then raise exception 'শর্তের প্রতিটি উত্তর লেখা হিসেবে দিতে হবে'; end if;
      if not exists (
        select 1 from jsonb_array_elements(p_schema) as parent(value)
         where parent.value->>'id' = condition->>'fieldId'
           and parent.value->>'type' in ('single','multi')
           and not exists (
             select 1 from jsonb_array_elements_text(condition->'values') as selected_value(value)
              where not (coalesce(parent.value->'options','[]'::jsonb) ? selected_value.value)
           )
      ) then raise exception 'শর্তের উত্তরটি নির্ভরশীল প্রশ্নের বিকল্পের সঙ্গে মিলছে না'; end if;
    end loop;
  end loop;
  select coalesce(max(version), 0) + 1 into next_version from public.article_questionnaire_versions;
  update public.article_questionnaire_versions set active = false where active;
  insert into public.article_questionnaire_versions(version, schema, active, created_by) values (next_version, p_schema, true, actor);
  insert into public.admin_audit_log(actor_id, action, target_id, reason, details)
    values (actor, 'edit_questionnaire', null, 'প্রশ্নমালা হালনাগাদ', jsonb_build_object('version', next_version, 'question_count', jsonb_array_length(p_schema)));
  return next_version;
end;
$$;

create or replace function public.get_article_questionnaire_responses(p_limit integer default 100)
returns table (article_id uuid, title text, slug text, status public.article_status, version integer, schema jsonb, answers jsonb, submitted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'শুধু প্রশাসক প্রশ্নোত্তর দেখতে পারবেন' using errcode = '42501'; end if;
  return query select a.id, a.title, a.slug, a.status, q.version, q.schema, r.answers, r.created_at
    from public.article_questionnaire_responses r join public.articles a on a.id = r.article_id
    join public.article_questionnaire_versions q on q.id = r.questionnaire_version_id
   order by r.created_at desc limit greatest(1, least(coalesce(p_limit, 100), 250));
end;
$$;

create or replace function public.get_public_article_questionnaire_stats()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  questionnaire record;
  field jsonb;
  option_value text;
  option_count bigint;
  people_count bigint;
  submission_count bigint;
  aggregate_value numeric;
  fields jsonb := '[]'::jsonb;
  choices jsonb;
  suppressed boolean;
  suppressed_option_count integer;
  minimum_visible_count bigint;
  minimum_visible_label text;
begin
  for questionnaire in select q.id, q.version, q.schema from public.article_questionnaire_versions q order by q.version loop
    for field in select value from jsonb_array_elements(questionnaire.schema) loop
      if field->>'type' not in ('single','multi','people','number') then continue; end if;
      select count(*) into submission_count from public.article_questionnaire_responses r join public.articles a on a.id = r.article_id
       where r.questionnaire_version_id = questionnaire.id and a.status = 'published';
      suppressed := submission_count < 5;
      if field->>'type' = 'people' then
        select coalesce(sum((r.answers->(field->>'id')->>'count')::bigint), 0) into people_count
          from public.article_questionnaire_responses r join public.articles a on a.id = r.article_id
         where r.questionnaire_version_id = questionnaire.id and a.status = 'published'
           and jsonb_typeof(r.answers->(field->>'id')->'count') = 'number';
        fields := fields || jsonb_build_array(jsonb_build_object('id', field->>'id', 'label', field->>'label', 'type', 'people', 'count', case when suppressed or people_count < 5 then null else people_count end, 'submissions', case when suppressed then null else submission_count end, 'suppressed', suppressed or people_count < 5, 'version', questionnaire.version));
      elsif field->>'type' = 'number' then
        select coalesce(sum((r.answers->>(field->>'id'))::numeric), 0) into aggregate_value
          from public.article_questionnaire_responses r join public.articles a on a.id = r.article_id
         where r.questionnaire_version_id = questionnaire.id and a.status = 'published'
           and jsonb_typeof(r.answers->(field->>'id')) = 'number';
        fields := fields || jsonb_build_array(jsonb_build_object('id', field->>'id', 'label', field->>'label', 'type', 'number', 'count', case when suppressed then null else aggregate_value end, 'submissions', case when suppressed then null else submission_count end, 'suppressed', suppressed, 'version', questionnaire.version));
      else
        choices := '[]'::jsonb;
        suppressed_option_count := 0;
        minimum_visible_count := null;
        minimum_visible_label := null;
        for option_value in select jsonb_array_elements_text(coalesce(field->'options','[]'::jsonb)) loop
          select count(*) into option_count from public.article_questionnaire_responses r join public.articles a on a.id = r.article_id
           where r.questionnaire_version_id = questionnaire.id and a.status = 'published'
             and case when field->>'type' = 'multi' then coalesce(r.answers->(field->>'id'), '[]'::jsonb) ? option_value else r.answers->(field->>'id') = to_jsonb(option_value) end;
          if option_count < 5 then
            suppressed_option_count := suppressed_option_count + 1;
          elsif minimum_visible_count is null or option_count < minimum_visible_count then
            minimum_visible_count := option_count;
            minimum_visible_label := option_value;
          end if;
          choices := choices || jsonb_build_array(jsonb_build_object('label', option_value, 'count', case when suppressed or option_count < 5 then null else option_count end, 'suppressed', suppressed or option_count < 5));
        end loop;
        -- Complementary suppression prevents subtraction from recovering a single
        -- small category from the visible total and the other category counts.
        if suppressed_option_count = 1 and minimum_visible_label is not null then
          select coalesce(jsonb_agg(case when choice.value->>'label' = minimum_visible_label then jsonb_build_object('label', choice.value->>'label', 'count', null, 'suppressed', true) else choice.value end order by choice.ord), '[]'::jsonb)
            into choices from jsonb_array_elements(choices) with ordinality as choice(value, ord);
        end if;
        suppressed := suppressed or suppressed_option_count > 0;
        fields := fields || jsonb_build_array(jsonb_build_object('id', field->>'id', 'label', field->>'label', 'type', field->>'type', 'choices', choices, 'submissions', case when suppressed then null else submission_count end, 'suppressed', suppressed, 'version', questionnaire.version));
      end if;
    end loop;
  end loop;
  return jsonb_build_object('fields', fields);
end;
$$;

revoke all on function public.get_active_article_questionnaire() from public;
revoke all on function public.validate_article_questionnaire_answers(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_article_questionnaire(jsonb) from public, anon;
revoke all on function public.get_article_questionnaire_responses(integer) from public, anon;
revoke all on function public.get_public_article_questionnaire_stats() from public;
grant execute on function public.get_active_article_questionnaire() to anon, authenticated;
grant execute on function public.save_article_questionnaire(jsonb), public.get_article_questionnaire_responses(integer) to authenticated;
grant execute on function public.get_public_article_questionnaire_stats() to anon, authenticated;

drop function public.submit_article(text, text, text, text, text, text, text[]);
create or replace function public.submit_article(
  p_category_slug text,
  p_title text,
  p_excerpt text,
  p_body text,
  p_hero_media_key text default null,
  p_slug text default null,
  p_media_keys text[] default null,
  p_questionnaire_answers jsonb default '{}'::jsonb,
  p_questionnaire_version_id uuid default null
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
begin
  if actor is null then raise exception 'প্রবেশ করতে হবে' using errcode = '42501'; end if;
  select role, reporter_tier into actor_role, actor_tier from public.user_roles where user_id = actor;
  if actor_role not in ('reporter', 'moderator', 'admin') then raise exception 'প্রতিবেদন জমা দিতে রিপোর্টার অনুমতি প্রয়োজন' using errcode = '42501'; end if;
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
      insert into public.articles (author_id, category_id, slug, title, excerpt, body, hero_media_key, status, published_at)
      values (actor, category, public.allocate_article_slug(p_title), trim(p_title), trim(p_excerpt), trim(p_body), hero_text,
        case when actor_role = 'reporter' and actor_tier = 'junior' then 'pending'::public.article_status else 'published'::public.article_status end,
        case when actor_role = 'reporter' and actor_tier = 'junior' then null else now() end) returning * into created;
      exit;
    exception when unique_violation then
      if attempt >= 4 then raise; end if;
    end;
  end loop;
  insert into public.article_media (article_id, media_id, position) select created.id, item.key::uuid, item.ord - 1 from unnest(gallery) with ordinality as item(key, ord);
  insert into public.article_questionnaire_responses(article_id, questionnaire_version_id, answers) values (created.id, questionnaire_id, validated_answers);
  insert into public.article_revisions (article_id, editor_id, version, title, excerpt, body, reason) values (created.id, actor, 1, created.title, created.excerpt, created.body, 'প্রাথমিক জমা');
  if created.status = 'published' then perform public.add_article_earning(created.id, actor); end if;
  return created;
end;
$$;
revoke all on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid) from public, anon;
grant execute on function public.submit_article(text, text, text, text, text, text, text[], jsonb, uuid) to authenticated;

commit;
