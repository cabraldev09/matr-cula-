-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION private.course_key (
  name text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select regexp_replace(private.normalize_text(name), '^(cst|curso superior de tecnologia|tecnologo|tecnologia|bacharelado|licenciatura) (em|de) ', '')
$function$;

REVOKE ALL ON FUNCTION private.course_key(text) FROM PUBLIC;

GRANT ALL ON FUNCTION private.course_key(text) TO authenticated;

GRANT ALL ON FUNCTION private.course_key(text) TO service_role;

CREATE OR REPLACE FUNCTION private.lead_from_message()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare person uuid; found_course uuid; text_norm text;
begin
  if new.direction <> 'incoming' then return new; end if;
  select contact_id into person from public.conversations where id = new.conversation_id;
  if person is null then return new; end if;
  text_norm := ' ' || private.normalize_text(new.body) || ' ';
  select c.id into found_course from public.courses c
    where c.organization_id = new.organization_id and c.active
      and position(' ' || private.course_key(c.name) || ' ' in text_norm) > 0
    order by length(private.course_key(c.name)) desc limit 1;
  update public.leads set incoming_messages = incoming_messages + 1,
      course_id = coalesce(course_id, found_course)
    where organization_id = new.organization_id and contact_id = person and stage not in ('matriculado', 'perdido');
  return new;
end $function$;
revoke all on function private.course_key(text) from anon;
