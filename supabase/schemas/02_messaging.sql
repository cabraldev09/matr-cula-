create table public.channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  provider text not null check (provider in ('simulator', 'whatsapp_cloud')),
  phone_number_id text unique check (phone_number_id ~ '^[0-9]{5,30}$'),
  default_team_id uuid,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, default_team_id) references public.teams(organization_id, id),
  check ((provider = 'simulator' and phone_number_id is null) or (provider = 'whatsapp_cloud' and phone_number_id is not null))
);
create index channels_team_idx on public.channels(organization_id, default_team_id);
alter table public.conversations add column channel_id uuid;
alter table public.conversations add constraint conversations_channel_fk foreign key (organization_id, channel_id) references public.channels(organization_id, id);
create unique index conversations_active_channel_idx on public.conversations(organization_id, channel_id, contact_id) where channel_id is not null and status <> 'closed';
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  channel_id uuid not null,
  direction text not null check (direction in ('incoming', 'outgoing')),
  body text not null check (length(trim(body)) between 1 and 4096),
  sender_id uuid,
  request_id uuid,
  provider_message_id text,
  status text not null check (status in ('received','queued','processing','sent','delivered','read','failed','unknown','simulated')),
  error_code text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (channel_id, provider_message_id),
  unique (organization_id, sender_id, request_id),
  foreign key (organization_id, conversation_id) references public.conversations(organization_id, id) on delete cascade,
  foreign key (organization_id, channel_id) references public.channels(organization_id, id),
  foreign key (organization_id, sender_id) references public.memberships(organization_id, user_id)
);
create index messages_timeline_idx on public.messages(organization_id, conversation_id, created_at desc, id);
create index messages_sender_idx on public.messages(organization_id, sender_id);
create table private.message_outbox (
  message_id uuid primary key,
  organization_id uuid not null,
  state text not null default 'pending' check (state in ('pending','processing','done','failed','unknown')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  foreign key (organization_id, message_id) references public.messages(organization_id, id) on delete cascade
);
create index message_outbox_pending_idx on private.message_outbox(available_at) where state = 'pending';
create index message_outbox_org_idx on private.message_outbox(organization_id, message_id);
create index message_outbox_lease_idx on private.message_outbox(lease_until) where state = 'processing';
create table private.webhook_receipts (
  id text primary key,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create index webhook_receipts_time_idx on private.webhook_receipts(received_at);
create table private.delivery_events (
  channel_id uuid not null references public.channels(id) on delete cascade,
  provider_message_id text not null,
  status text not null check (status in ('sent','delivered','read','failed')),
  error_code text,
  primary key(channel_id, provider_message_id, status)
);
alter table private.webhook_receipts enable row level security;
alter table private.delivery_events enable row level security;
revoke all on private.webhook_receipts,private.delivery_events from public,anon,authenticated,service_role;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table private.message_outbox enable row level security;
create policy channels_read on public.channels for select to authenticated using (private.organization_role(organization_id) is not null);
create policy messages_read on public.messages for select to authenticated using (private.can_access_conversation(organization_id, conversation_id));
revoke all on public.channels, public.messages from public, anon, authenticated;
grant select on public.channels, public.messages to authenticated;
grant all on public.channels, public.messages to service_role;
revoke all on private.message_outbox from public, anon, authenticated, service_role;

create function private.create_channel(org uuid, channel_name text, channel_provider text, phone_id text, team uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null or not private.is_manager(org) then raise exception 'Permission denied' using errcode = '42501'; end if;
  insert into public.channels(organization_id, name, provider, phone_number_id, default_team_id)
    values(org, trim(channel_name), channel_provider, nullif(trim(phone_id), ''), team) returning id into result;
  return result;
end $$;
create function public.create_channel(org uuid, channel_name text, channel_provider text, phone_id text default null, team uuid default null) returns uuid
language sql security invoker set search_path = '' as $$ select private.create_channel(org,channel_name,channel_provider,phone_id,team) $$;
create function private.set_channel_enabled(channel uuid, active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.channels;
begin
  select * into target from public.channels where id = channel for update;
  if auth.uid() is null or not private.is_manager(target.organization_id) then raise exception 'Permission denied' using errcode = '42501'; end if;
  if active is null then raise exception 'Invalid state' using errcode = '23514'; end if;
  update public.channels set enabled = active where id = channel;
end $$;
create function public.set_channel_enabled(channel uuid, active boolean) returns void
language sql security invoker set search_path = '' as $$ select private.set_channel_enabled(channel,active) $$;

-- Service-only ingestion; authenticated callers use the simulator wrapper below.
create function private.ingest_text(channel uuid, phone text, contact_name text, message_body text, external_id text, happened_at timestamptz) returns uuid
language plpgsql security invoker set search_path = '' as $$
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
end $$;
create function private.simulate_incoming(channel uuid, phone text, contact_name text, message_body text, event_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target public.channels;
begin
  select * into target from public.channels where id = channel;
  if auth.uid() is null or target.provider <> 'simulator' or target.id is null or not private.is_manager(target.organization_id) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  return private.ingest_text(channel,phone,contact_name,message_body,'sim:' || event_id::text,now());
end $$;
create function public.simulate_incoming(channel uuid, phone text, contact_name text, message_body text, event_id uuid) returns uuid
language sql security invoker set search_path = '' as $$ select private.simulate_incoming(channel,phone,contact_name,message_body,event_id) $$;

create function private.queue_message(conversation uuid, message_body text, idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
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
end $$;
create function public.queue_message(conversation uuid, message_body text, idempotency_key uuid) returns uuid
language sql security invoker set search_path = '' as $$ select private.queue_message(conversation,message_body,idempotency_key) $$;

revoke all on function private.create_channel(uuid,text,text,text,uuid),private.set_channel_enabled(uuid,boolean),
 private.simulate_incoming(uuid,text,text,text,uuid),private.queue_message(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.create_channel(uuid,text,text,text,uuid),private.set_channel_enabled(uuid,boolean),
 private.simulate_incoming(uuid,text,text,text,uuid),private.queue_message(uuid,text,uuid) to authenticated;
revoke all on function private.ingest_text(uuid,text,text,text,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.create_channel(uuid,text,text,text,uuid),public.set_channel_enabled(uuid,boolean),
 public.simulate_incoming(uuid,text,text,text,uuid),public.queue_message(uuid,text,uuid) from public,anon;
grant execute on function public.create_channel(uuid,text,text,text,uuid),public.set_channel_enabled(uuid,boolean),
 public.simulate_incoming(uuid,text,text,text,uuid),public.queue_message(uuid,text,uuid) to authenticated;
alter publication supabase_realtime add table public.channels,public.messages;
