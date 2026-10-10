-- The answer sheet behind one published story, shaped for its page.
--
-- Choice questions list every option with whether it was ticked. Headcounts and numbers are given as
-- numbers. Free-text answers, and the names and identifications of the people in a people question,
-- are never returned: they can name real people, so they stay with the desk. Questions the reporter
-- did not answer (because a condition hid them) are left out rather than shown as empty.
begin;

create or replace function public.get_public_article_questionnaire(p_article_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  response_answers jsonb;
  response_schema jsonb;
  field jsonb;
  answer jsonb;
  option_value text;
  choices jsonb;
  is_selected boolean;
  fields jsonb := '[]'::jsonb;
begin
  select r.answers, q.schema into response_answers, response_schema
    from public.article_questionnaire_responses r
    join public.articles a on a.id = r.article_id
    join public.article_questionnaire_versions q on q.id = r.questionnaire_version_id
   where r.article_id = p_article_id and a.status = 'published';
  if response_answers is null then return null; end if;

  for field in select value from jsonb_array_elements(response_schema) loop
    answer := response_answers -> (field->>'id');
    if answer is null or answer = 'null'::jsonb then continue; end if;

    if field->>'type' in ('single', 'multi') then
      choices := '[]'::jsonb;
      for option_value in select jsonb_array_elements_text(coalesce(field->'options', '[]'::jsonb)) loop
        is_selected := case when field->>'type' = 'multi'
          then answer ? option_value
          else answer = to_jsonb(option_value) end;
        choices := choices || jsonb_build_array(jsonb_build_object(
          'label', option_value,
          'selected', coalesce(is_selected, false)
        ));
      end loop;
      fields := fields || jsonb_build_array(jsonb_build_object(
        'id', field->>'id',
        'label', field->>'label',
        'type', field->>'type',
        'choices', choices
      ));
    elsif field->>'type' = 'people' and jsonb_typeof(answer->'count') = 'number' then
      fields := fields || jsonb_build_array(jsonb_build_object(
        'id', field->>'id',
        'label', field->>'label',
        'type', 'people',
        'count', (answer->>'count')::integer
      ));
    elsif field->>'type' = 'number' and jsonb_typeof(answer) = 'number' then
      fields := fields || jsonb_build_array(jsonb_build_object(
        'id', field->>'id',
        'label', field->>'label',
        'type', 'number',
        'count', (answer #>> '{}')::numeric
      ));
    end if;
  end loop;

  return jsonb_build_object('fields', fields);
end;
$$;

revoke all on function public.get_public_article_questionnaire(uuid) from public;
grant execute on function public.get_public_article_questionnaire(uuid) to anon, authenticated;

commit;
