-- Tenant isolation is enforced by the database, including direct Data API access.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  timezone text not null default 'America/Porto_Velho',
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  created_at timestamptz not null default now()
);
create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'supervisor', 'agent')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id, organization_id);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  role text not null check (role in ('admin', 'supervisor', 'agent')),
  token_hash text not null unique,
  created_by uuid not null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, created_by) references public.memberships(organization_id, user_id)
);
create index invitations_org_idx on public.invitations(organization_id, created_at desc);
create index invitations_creator_idx on public.invitations(organization_id, created_by);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  color text not null default '#3956ff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  greeting_message text not null default '',
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);
create table public.team_members (
  organization_id uuid not null,
  team_id uuid not null,
  user_id uuid not null,
  primary key (organization_id, team_id, user_id),
  foreign key (organization_id, team_id) references public.teams(organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references public.memberships(organization_id, user_id) on delete cascade
);
create index team_members_user_idx on public.team_members(organization_id, user_id);
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  phone text check (phone ~ '^\+?[0-9]{8,15}$'),
  email text,
  custom_fields jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, phone)
);
create index contacts_org_created_idx on public.contacts(organization_id, created_at desc);
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  color text not null default '#3956ff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  unique (organization_id, id),
  unique (organization_id, name)
);
create table public.contact_tags (
  organization_id uuid not null,
  contact_id uuid not null,
  tag_id uuid not null,
  primary key (organization_id, contact_id, tag_id),
  foreign key (organization_id, contact_id) references public.contacts(organization_id, id) on delete cascade,
  foreign key (organization_id, tag_id) references public.tags(organization_id, id) on delete cascade
);
create index contact_tags_tag_idx on public.contact_tags(organization_id, tag_id);
create table public.quick_answers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shortcut text not null check (length(trim(shortcut)) between 1 and 30),
  body text not null check (length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  unique (organization_id, shortcut)
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null,
  team_id uuid,
  assigned_to uuid,
  status text not null default 'pending' check (status in ('pending', 'open', 'closed')),
  subject text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, contact_id) references public.contacts(organization_id, id),
  foreign key (organization_id, team_id) references public.teams(organization_id, id),
  foreign key (organization_id, assigned_to) references public.memberships(organization_id, user_id)
);
create index conversations_org_status_idx on public.conversations(organization_id, status, updated_at desc);
create index conversations_contact_idx on public.conversations(organization_id, contact_id);
create index conversations_team_idx on public.conversations(organization_id, team_id);
create index conversations_assignee_idx on public.conversations(organization_id, assigned_to);
create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  author_id uuid not null default auth.uid(),
  body text not null check (length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  foreign key (organization_id, conversation_id) references public.conversations(organization_id, id) on delete cascade,
  foreign key (organization_id, author_id) references public.memberships(organization_id, user_id)
);
create index internal_notes_conversation_idx on public.internal_notes(organization_id, conversation_id, created_at);
create index internal_notes_author_idx on public.internal_notes(organization_id, author_id);

-- Definer helpers live outside exposed schemas to avoid recursive membership policies.
-- Each helper derives identity from auth.uid(), never from caller-provided user ids.
create function private.organization_role(org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.memberships
  where organization_id = org and user_id = (select auth.uid()) and active
    and (select auth.uid()) is not null
$$;
create function private.is_manager(org uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select coalesce(private.organization_role(org) in ('owner', 'admin'), false)
$$;
create function private.can_access_team(org uuid, team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.memberships m where m.organization_id = org and m.user_id = (select auth.uid()) and m.active
    and (m.role in ('owner', 'admin', 'supervisor') or team is null or exists (
      select 1 from public.team_members tm where tm.organization_id = org
      and tm.team_id = team and tm.user_id = (select auth.uid())
    ))
  )
$$;
create function private.can_access_conversation(org uuid, conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.conversations c where c.organization_id = org and c.id = conversation
    and private.can_access_team(c.organization_id, c.team_id)
  )
$$;
create function private.shares_organization(other_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.memberships mine join public.memberships theirs using (organization_id)
    where mine.user_id = (select auth.uid()) and theirs.user_id = other_user and mine.active and theirs.active
  )
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.contacts enable row level security;
alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.quick_answers enable row level security;
alter table public.conversations enable row level security;
alter table public.internal_notes enable row level security;

create policy organizations_read on public.organizations for select to authenticated
using (private.organization_role(id) is not null);
create policy organizations_update on public.organizations for update to authenticated
using (private.is_manager(id)) with check (private.is_manager(id));
create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or private.shares_organization(id));
create policy profiles_insert on public.profiles for insert to authenticated
with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy memberships_read on public.memberships for select to authenticated
using (private.organization_role(organization_id) is not null);
create policy invitations_read on public.invitations for select to authenticated
using (private.is_manager(organization_id));
create policy teams_read on public.teams for select to authenticated
using (private.organization_role(organization_id) is not null);
create policy teams_write on public.teams for all to authenticated
using (private.is_manager(organization_id)) with check (private.is_manager(organization_id));
create policy team_members_read on public.team_members for select to authenticated
using (private.organization_role(organization_id) is not null);
create policy team_members_write on public.team_members for all to authenticated
using (private.is_manager(organization_id)) with check (private.is_manager(organization_id));
create policy contacts_read on public.contacts for select to authenticated
using (private.organization_role(organization_id) is not null);
create policy contacts_insert on public.contacts for insert to authenticated
with check (private.organization_role(organization_id) is not null);
create policy contacts_update on public.contacts for update to authenticated
using (private.organization_role(organization_id) is not null)
with check (private.organization_role(organization_id) is not null);
create policy contacts_delete on public.contacts for delete to authenticated
using (private.is_manager(organization_id));
create policy tags_read on public.tags for select to authenticated
using (private.organization_role(organization_id) is not null);
create policy tags_write on public.tags for all to authenticated
using (private.is_manager(organization_id)) with check (private.is_manager(organization_id));
create policy contact_tags_write on public.contact_tags for all to authenticated
using (private.organization_role(organization_id) is not null)
with check (private.organization_role(organization_id) is not null);
create policy quick_answers_read on public.quick_answers for select to authenticated
using (private.organization_role(organization_id) is not null);
create policy quick_answers_write on public.quick_answers for all to authenticated
using (private.is_manager(organization_id)) with check (private.is_manager(organization_id));
create policy conversations_read on public.conversations for select to authenticated
using (private.can_access_team(organization_id, team_id));
create policy conversations_insert on public.conversations for insert to authenticated
with check (private.can_access_team(organization_id, team_id) and assigned_to is null and status = 'pending');
-- Assignment changes only through locked RPCs, not generic table updates.
create policy notes_read on public.internal_notes for select to authenticated
using (private.can_access_conversation(organization_id, conversation_id));
create policy notes_insert on public.internal_notes for insert to authenticated
with check (author_id = (select auth.uid()) and private.can_access_conversation(organization_id, conversation_id));

create function private.create_organization(org_name text, display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare org uuid; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- Serializes simultaneous onboarding requests for the same user.
  perform 1 from auth.users where id = actor for update;
  if (select count(*) from public.memberships where user_id = actor and role = 'owner' and active) >= 5 then
    raise exception 'Organization limit reached' using errcode = '23514';
  end if;
  insert into public.profiles(id, display_name) values (actor, trim(display_name))
    on conflict (id) do update set display_name = excluded.display_name;
  insert into public.organizations(name) values (trim(org_name)) returning id into org;
  insert into public.memberships(organization_id, user_id, role) values (org, actor, 'owner');
  return org;
end $$;
create function public.create_organization(org_name text, display_name text) returns uuid
language sql security invoker set search_path = '' as $$
  select private.create_organization(org_name, display_name)
$$;

create function private.invite_member(org uuid, invite_email text, invite_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare secret text := gen_random_uuid()::text; invitation uuid;
begin
  if auth.uid() is null or not private.is_manager(org) then
    raise exception 'Only administrators can invite members' using errcode = '42501';
  end if;
  if invite_role not in ('admin', 'supervisor', 'agent') or invite_role is null then
    raise exception 'Invalid role' using errcode = '23514';
  end if;
  if invite_role = 'admin' and private.organization_role(org) <> 'owner' then
    raise exception 'Only the owner can invite administrators' using errcode = '42501';
  end if;
  insert into public.invitations(organization_id, email, role, token_hash, created_by)
  values (org, lower(trim(invite_email)), invite_role, encode(extensions.digest(secret, 'sha256'), 'hex'), auth.uid())
  returning id into invitation;
  return jsonb_build_object('id', invitation, 'token', secret);
end $$;
create function public.invite_member(org uuid, invite_email text, invite_role text) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.invite_member(org, invite_email, invite_role)
$$;
create function private.accept_invitation(invite_token text, display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare invitation public.invitations; actor_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select lower(email) into actor_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  select * into invitation from public.invitations
  where token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex') for update;
  if invitation.id is null or invitation.accepted_at is not null or invitation.revoked_at is not null
    or invitation.expires_at <= now() or actor_email is null or actor_email <> invitation.email then
    raise exception 'Invalid, expired or mismatched invitation' using errcode = '42501';
  end if;
  insert into public.profiles(id, display_name) values (auth.uid(), trim(display_name))
    on conflict (id) do update set display_name = excluded.display_name;
  insert into public.memberships(organization_id, user_id, role)
    values (invitation.organization_id, auth.uid(), invitation.role)
    on conflict (organization_id, user_id) do update set role = excluded.role, active = true
    where not public.memberships.active;
  if not found then raise exception 'Already a member' using errcode = '23514'; end if;
  update public.invitations set accepted_at = now() where id = invitation.id;
  return invitation.organization_id;
end $$;
create function public.accept_invitation(invite_token text, display_name text) returns uuid
language sql security invoker set search_path = '' as $$
  select private.accept_invitation(invite_token, display_name)
$$;
create function private.revoke_invitation(invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare invitation public.invitations;
begin
  select * into invitation from public.invitations where id = invitation_id for update;
  if auth.uid() is null or not private.is_manager(invitation.organization_id) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  update public.invitations set revoked_at = now() where id = invitation_id and accepted_at is null;
end $$;
create function public.revoke_invitation(invitation_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.revoke_invitation(invitation_id) $$;
create function private.remove_member(org uuid, member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare member_role text;
begin
  perform 1 from public.organizations where id = org for update;
  select role into member_role from public.memberships where organization_id = org and user_id = member;
  if auth.uid() is null or not private.is_manager(org) or member_role = 'owner'
    or (member_role = 'admin' and private.organization_role(org) <> 'owner') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  update public.conversations set assigned_to = null, status = case when status = 'open' then 'pending' else status end
    where organization_id = org and assigned_to = member;
  delete from public.team_members where organization_id = org and user_id = member;
  update public.memberships set active = false where organization_id = org and user_id = member;
  update public.invitations set revoked_at = now() where organization_id = org and created_by = member and accepted_at is null;
end $$;
create function public.remove_member(org uuid, member uuid) returns void
language sql security invoker set search_path = '' as $$ select private.remove_member(org, member) $$;

create function private.claim_conversation(conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ticket public.conversations;
begin
  select * into ticket from public.conversations where id = conversation for update;
  if auth.uid() is null or ticket.id is null or not private.can_access_team(ticket.organization_id, ticket.team_id) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if ticket.status <> 'pending' or ticket.assigned_to is not null then
    raise exception 'Conversation already assigned' using errcode = '23514';
  end if;
  update public.conversations set assigned_to = auth.uid(), status = 'open', updated_at = now() where id = conversation;
end $$;
create function public.claim_conversation(conversation uuid) returns void
language sql security invoker set search_path = '' as $$ select private.claim_conversation(conversation) $$;
create function private.close_conversation(conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ticket public.conversations;
begin
  select * into ticket from public.conversations where id = conversation for update;
  if auth.uid() is null or ticket.id is null or not private.can_access_team(ticket.organization_id, ticket.team_id)
    or not (coalesce(ticket.assigned_to = auth.uid(), false) or private.organization_role(ticket.organization_id) in ('owner', 'admin', 'supervisor')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  update public.conversations set status = 'closed', updated_at = now() where id = conversation;
end $$;
create function public.close_conversation(conversation uuid) returns void
language sql security invoker set search_path = '' as $$ select private.close_conversation(conversation) $$;

-- Explicit grants: anon cannot access business tables or onboarding RPCs.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.organizations, public.memberships, public.invitations, public.conversations, public.internal_notes to authenticated;
grant update (name, timezone) on public.organizations to authenticated;
grant select, insert on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, delete on public.teams, public.team_members, public.contacts, public.tags, public.contact_tags, public.quick_answers to authenticated;
grant update (name, color, greeting_message) on public.teams to authenticated;
grant update (name, phone, email, custom_fields, updated_at) on public.contacts to authenticated;
grant update (name, color) on public.tags to authenticated;
grant update (shortcut, body) on public.quick_answers to authenticated;
grant insert (organization_id, contact_id, team_id, subject) on public.conversations to authenticated;
grant insert (organization_id, conversation_id, author_id, body) on public.internal_notes to authenticated;
grant all on all tables in schema public to service_role;
revoke all on all functions in schema private from public, anon, authenticated, service_role;
grant execute on all functions in schema private to authenticated;
revoke all on function public.create_organization(text, text), public.invite_member(uuid, text, text),
  public.accept_invitation(text, text), public.revoke_invitation(uuid), public.remove_member(uuid, uuid),
  public.claim_conversation(uuid), public.close_conversation(uuid) from public, anon;
grant execute on function public.create_organization(text, text), public.invite_member(uuid, text, text),
  public.accept_invitation(text, text), public.revoke_invitation(uuid), public.remove_member(uuid, uuid),
  public.claim_conversation(uuid), public.close_conversation(uuid) to authenticated;

-- Private attachments use organization/conversation/random-file paths.
insert into storage.buckets(id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 20971520) on conflict (id) do nothing;
create policy attachments_read on storage.objects for select to authenticated
using (bucket_id = 'attachments' and exists (
  select 1 from public.conversations c where c.organization_id::text = (storage.foldername(name))[1]
  and c.id::text = (storage.foldername(name))[2] and private.can_access_team(c.organization_id, c.team_id)
));
create policy attachments_insert on storage.objects for insert to authenticated
with check (bucket_id = 'attachments' and exists (
  select 1 from public.conversations c where c.organization_id::text = (storage.foldername(name))[1]
  and c.id::text = (storage.foldername(name))[2] and private.can_access_team(c.organization_id, c.team_id)
));

-- Postgres Changes honors the table SELECT policies for each subscriber.
alter publication supabase_realtime add table public.contacts, public.conversations, public.internal_notes;
