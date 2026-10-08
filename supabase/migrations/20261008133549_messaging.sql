-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION private.create_channel (
  org              uuid,
  channel_name     text,
  channel_provider text,
  phone_id         text,
  team             uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare result uuid;
begin
  if auth.uid() is null or not private.is_manager(org) then raise exception 'Permission denied' using errcode = '42501'; end if;
  insert into public.channels(organization_id, name, provider, phone_number_id, default_team_id)
    values(org, trim(channel_name), channel_provider, nullif(trim(phone_id), ''), team) returning id into result;
  return result;
end $function$;

REVOKE ALL ON FUNCTION private.create_channel(uuid, text, text, text, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.create_channel(uuid, text, text, text, uuid) TO authenticated;

CREATE FUNCTION private.ingest_text (
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
    on conflict(organization_id,phone) do update set updated_at = now() returning id into person;
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

REVOKE ALL ON FUNCTION private.ingest_text(uuid, text, text, text, text, timestamp WITH time zone) FROM PUBLIC;

CREATE FUNCTION private.queue_message (
  conversation    uuid,
  message_body    text,
  idempotency_key uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare ticket public.conversations; target public.channels; previous public.messages; result uuid;
begin
  select * into ticket from public.conversations where id = conversation for update;
  if auth.uid() is null or ticket.id is null or not private.can_access_conversation(ticket.organization_id,ticket.id)
    or not(coalesce(ticket.assigned_to = auth.uid(),false) or private.organization_role(ticket.organization_id) in ('owner','admin','supervisor')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if idempotency_key is null then raise exception 'Request key required' using errcode = '23514'; end if;
  select * into previous from public.messages where organization_id = ticket.organization_id and sender_id = auth.uid() and request_id = idempotency_key;
  if previous.id is not null then
    if previous.conversation_id <> conversation or previous.body <> message_body then raise exception 'Request key conflict' using errcode = '23514'; end if;
    return previous.id;
  end if;
  select * into target from public.channels where id = ticket.channel_id;
  if ticket.status <> 'open' or target.id is null or not target.enabled then raise exception 'Open an active channel conversation before sending' using errcode = '23514'; end if;
  if target.provider = 'whatsapp_cloud' and not exists(select 1 from public.messages where conversation_id = conversation and direction = 'incoming' and occurred_at > now() - interval '24 hours') then
    raise exception 'WhatsApp reply window expired; approved templates are required' using errcode = '23514';
  end if;
  insert into public.messages(organization_id,conversation_id,channel_id,direction,body,sender_id,request_id,status)
    values(ticket.organization_id,ticket.id,ticket.channel_id,'outgoing',message_body,auth.uid(),idempotency_key,'queued') returning id into result;
  insert into private.message_outbox(message_id,organization_id) values(result,ticket.organization_id);
  update public.conversations set updated_at = now() where id = ticket.id;
  return result;
end $function$;

REVOKE ALL ON FUNCTION private.queue_message(uuid, text, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.queue_message(uuid, text, uuid) TO authenticated;

CREATE FUNCTION private.set_channel_enabled (
  channel uuid,
  active  boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare target public.channels;
begin
  select * into target from public.channels where id = channel for update;
  if auth.uid() is null or not private.is_manager(target.organization_id) then raise exception 'Permission denied' using errcode = '42501'; end if;
  if active is null then raise exception 'Invalid state' using errcode = '23514'; end if;
  update public.channels set enabled = active where id = channel;
end $function$;

REVOKE ALL ON FUNCTION private.set_channel_enabled(uuid, boolean) FROM PUBLIC;

GRANT ALL ON FUNCTION private.set_channel_enabled(uuid, boolean) TO authenticated;

CREATE FUNCTION private.simulate_incoming (
  channel      uuid,
  phone        text,
  contact_name text,
  message_body text,
  event_id     uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare target public.channels;
begin
  select * into target from public.channels where id = channel;
  if auth.uid() is null or target.provider <> 'simulator' or target.id is null or not private.is_manager(target.organization_id) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  return private.ingest_text(channel,phone,contact_name,message_body,'sim:' || event_id::text,now());
end $function$;

REVOKE ALL ON FUNCTION private.simulate_incoming(uuid, text, text, text, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.simulate_incoming(uuid, text, text, text, uuid) TO authenticated;

CREATE TABLE private.delivery_events (
  channel_id          uuid NOT NULL,
  provider_message_id text NOT NULL,
  status              text NOT NULL,
  error_code          text
);

ALTER TABLE private.delivery_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE private.delivery_events
  ADD CONSTRAINT delivery_events_pkey PRIMARY KEY (channel_id, provider_message_id, status);

ALTER TABLE private.delivery_events
  ADD CONSTRAINT delivery_events_status_check CHECK (status = ANY (ARRAY['sent'::text, 'delivered'::text, 'read'::text, 'failed'::text]));

CREATE TABLE private.message_outbox (
  message_id      uuid                     NOT NULL,
  organization_id uuid                     NOT NULL,
  state           text                     DEFAULT 'pending'::text NOT NULL,
  attempts        integer                  DEFAULT 0 NOT NULL,
  available_at    timestamp with time zone DEFAULT now() NOT NULL,
  lease_token     uuid,
  lease_until     timestamp with time zone
);

ALTER TABLE private.message_outbox
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE private.message_outbox
  ADD CONSTRAINT message_outbox_pkey PRIMARY KEY (message_id);

ALTER TABLE private.message_outbox
  ADD CONSTRAINT message_outbox_state_check CHECK (state = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text, 'unknown'::text]));

CREATE INDEX message_outbox_pending_idx ON private.message_outbox (available_at)
  WHERE state = 'pending'::text;

CREATE INDEX message_outbox_lease_idx ON private.message_outbox (lease_until)
  WHERE state = 'processing'::text;

CREATE INDEX message_outbox_org_idx ON private.message_outbox (organization_id, message_id);

CREATE TABLE private.webhook_receipts (
  id          text                     NOT NULL,
  payload     jsonb                    NOT NULL,
  received_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE private.webhook_receipts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE private.webhook_receipts
  ADD CONSTRAINT webhook_receipts_pkey PRIMARY KEY (id);

CREATE INDEX webhook_receipts_time_idx ON private.webhook_receipts (received_at);

CREATE FUNCTION public.create_channel (
  org              uuid,
  channel_name     text,
  channel_provider text,
  phone_id         text DEFAULT NULL::text,
  team             uuid DEFAULT NULL::uuid
)
  RETURNS uuid
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.create_channel(org,channel_name,channel_provider,phone_id,team) $function$;

REVOKE ALL ON FUNCTION public.create_channel(uuid, text, text, text, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.create_channel(uuid, text, text, text, uuid) TO authenticated;

CREATE FUNCTION public.queue_message (
  conversation    uuid,
  message_body    text,
  idempotency_key uuid
)
  RETURNS uuid
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.queue_message(conversation,message_body,idempotency_key) $function$;

REVOKE ALL ON FUNCTION public.queue_message(uuid, text, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.queue_message(uuid, text, uuid) TO authenticated;

CREATE FUNCTION public.set_channel_enabled (
  channel uuid,
  active  boolean
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.set_channel_enabled(channel,active) $function$;

REVOKE ALL ON FUNCTION public.set_channel_enabled(uuid, boolean) FROM PUBLIC;

GRANT ALL ON FUNCTION public.set_channel_enabled(uuid, boolean) TO authenticated;

CREATE FUNCTION public.simulate_incoming (
  channel      uuid,
  phone        text,
  contact_name text,
  message_body text,
  event_id     uuid
)
  RETURNS uuid
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.simulate_incoming(channel,phone,contact_name,message_body,event_id) $function$;

REVOKE ALL ON FUNCTION public.simulate_incoming(uuid, text, text, text, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.simulate_incoming(uuid, text, text, text, uuid) TO authenticated;

CREATE TABLE public.channels (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  name            text                     NOT NULL,
  provider        text                     NOT NULL,
  phone_number_id text,
  default_team_id uuid,
  enabled         boolean                  DEFAULT true NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.channels
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_check CHECK (provider = 'simulator'::text AND phone_number_id IS NULL OR provider = 'whatsapp_cloud'::text AND phone_number_id IS NOT NULL);

ALTER TABLE public.channels
  ADD CONSTRAINT channels_name_check CHECK (length(TRIM(BOTH FROM name)) >= 2 AND length(TRIM(BOTH FROM name)) <= 120);

ALTER TABLE public.channels
  ADD CONSTRAINT channels_organization_id_default_team_id_fkey FOREIGN KEY (organization_id, default_team_id) REFERENCES public.teams(organization_id, id);

ALTER TABLE public.channels
  ADD CONSTRAINT channels_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.channels
  ADD CONSTRAINT channels_phone_number_id_check CHECK (phone_number_id ~ '^[0-9]{5,30}$'::text);

ALTER TABLE public.channels
  ADD CONSTRAINT channels_phone_number_id_key UNIQUE (phone_number_id);

ALTER TABLE public.channels
  ADD CONSTRAINT channels_pkey PRIMARY KEY (id);

ALTER TABLE private.delivery_events
  ADD CONSTRAINT delivery_events_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_provider_check CHECK (provider = ANY (ARRAY['simulator'::text, 'whatsapp_cloud'::text]));

GRANT SELECT ON public.channels TO authenticated;

GRANT ALL ON public.channels TO service_role;

CREATE INDEX channels_team_idx ON public.channels (organization_id, default_team_id);

CREATE POLICY channels_read ON public.channels
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

ALTER TABLE public.conversations
  ADD COLUMN channel_id uuid;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_channel_fk FOREIGN KEY (organization_id, channel_id) REFERENCES public.channels(organization_id, id);

CREATE UNIQUE INDEX conversations_active_channel_idx ON public.conversations (organization_id, channel_id, contact_id)
  WHERE channel_id IS NOT NULL AND status <> 'closed'::text;

CREATE TABLE public.messages (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id     uuid                     NOT NULL,
  conversation_id     uuid                     NOT NULL,
  channel_id          uuid                     NOT NULL,
  direction           text                     NOT NULL,
  body                text                     NOT NULL,
  sender_id           uuid,
  request_id          uuid,
  provider_message_id text,
  status              text                     NOT NULL,
  error_code          text,
  occurred_at         timestamp with time zone DEFAULT now() NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.channels, TABLE public.messages;

ALTER TABLE public.messages
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_body_check CHECK (length(TRIM(BOTH FROM body)) >= 1 AND length(TRIM(BOTH FROM body)) <= 4096);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_channel_id_provider_message_id_key UNIQUE (channel_id, provider_message_id);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_direction_check CHECK (direction = ANY (ARRAY['incoming'::text, 'outgoing'::text]));

ALTER TABLE public.messages
  ADD CONSTRAINT messages_organization_id_channel_id_fkey FOREIGN KEY (organization_id, channel_id) REFERENCES public.channels(organization_id, id);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_organization_id_conversation_id_fkey FOREIGN KEY (organization_id, conversation_id) REFERENCES public.conversations(organization_id, id) ON DELETE CASCADE;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE private.message_outbox
  ADD CONSTRAINT message_outbox_organization_id_message_id_fkey FOREIGN KEY (organization_id, message_id) REFERENCES public.messages(organization_id, id) ON DELETE CASCADE;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_organization_id_sender_id_fkey FOREIGN KEY (organization_id, sender_id) REFERENCES public.memberships(organization_id, user_id);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_organization_id_sender_id_request_id_key UNIQUE (organization_id, sender_id, request_id);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_status_check
    CHECK
    (status = ANY (ARRAY['received'::text, 'queued'::text, 'processing'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'unknown'::text, 'simulated'::text]));

GRANT SELECT ON public.messages TO authenticated;

GRANT ALL ON public.messages TO service_role;

CREATE INDEX messages_timeline_idx ON public.messages (organization_id, conversation_id, created_at DESC, id);

CREATE INDEX messages_sender_idx ON public.messages (organization_id, sender_id);

CREATE POLICY messages_read ON public.messages
  FOR SELECT
  TO authenticated
  USING (private.can_access_conversation(organization_id, conversation_id));