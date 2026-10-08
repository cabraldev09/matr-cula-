-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.ingest_text (
  channel      uuid,
  phone        text,
  contact_name text,
  message_body text,
  external_id  text,
  happened_at  timestamp with time zone
)
  RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare target public.channels; person uuid; ticket uuid; result uuid;
begin
  select * into target from public.channels where id = channel for update;
  if target.id is null or not target.enabled then raise exception 'Channel unavailable' using errcode = '23514'; end if;
  if external_id is null or length(external_id) not between 1 and 250 or phone !~ '^[0-9]{8,15}$' or phone is null
    or happened_at is null or happened_at > now() + interval '5 minutes' then raise exception 'Invalid incoming message' using errcode = '23514'; end if;
  select id into result from public.messages where channel_id = channel and provider_message_id = external_id;
  if result is not null then return result; end if;
  insert into public.contacts(organization_id,name,phone) values(target.organization_id,left(coalesce(nullif(trim(contact_name),''),phone),120),phone)
    on conflict on constraint contacts_organization_id_phone_key do update set updated_at = now() returning id into person;
  select id into ticket from public.conversations where organization_id = target.organization_id and channel_id = channel and contact_id = person and status <> 'closed';
  if ticket is null then
    insert into public.conversations(organization_id,contact_id,team_id,channel_id,subject)
      values(target.organization_id,person,target.default_team_id,channel,'Conversa · ' || phone) returning id into ticket;
  end if;
  insert into public.messages(organization_id,conversation_id,channel_id,direction,body,provider_message_id,status,occurred_at)
    values(target.organization_id,ticket,channel,'incoming',message_body,external_id,'received',happened_at) returning id into result;
  update public.conversations set updated_at = now() where id = ticket;
  return result;
end $function$;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.channels FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.channels FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.messages FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.messages FROM authenticated;