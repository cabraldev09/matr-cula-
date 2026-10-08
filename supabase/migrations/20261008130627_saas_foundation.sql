-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE SCHEMA private AUTHORIZATION postgres;

GRANT USAGE ON SCHEMA private TO authenticated;

GRANT USAGE ON SCHEMA private TO service_role;

CREATE FUNCTION private.accept_invitation (
  invite_token text,
  display_name text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

REVOKE ALL ON FUNCTION private.accept_invitation(text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION private.accept_invitation(text, text) TO authenticated;

CREATE FUNCTION private.can_access_conversation (
  org          uuid,
  conversation uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.conversations c where c.organization_id = org and c.id = conversation
    and private.can_access_team(c.organization_id, c.team_id)
  )
$function$;

REVOKE ALL ON FUNCTION private.can_access_conversation(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.can_access_conversation(uuid, uuid) TO authenticated;

CREATE FUNCTION private.can_access_team (
  org  uuid,
  team uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.memberships m where m.organization_id = org and m.user_id = (select auth.uid()) and m.active
    and (m.role in ('owner', 'admin', 'supervisor') or team is null or exists (
      select 1 from public.team_members tm where tm.organization_id = org
      and tm.team_id = team and tm.user_id = (select auth.uid())
    ))
  )
$function$;

REVOKE ALL ON FUNCTION private.can_access_team(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.can_access_team(uuid, uuid) TO authenticated;

CREATE FUNCTION private.claim_conversation (
  conversation uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

REVOKE ALL ON FUNCTION private.claim_conversation(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.claim_conversation(uuid) TO authenticated;

CREATE FUNCTION private.close_conversation (
  conversation uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare ticket public.conversations;
begin
  select * into ticket from public.conversations where id = conversation for update;
  if auth.uid() is null or ticket.id is null or not private.can_access_team(ticket.organization_id, ticket.team_id)
    or not (coalesce(ticket.assigned_to = auth.uid(), false) or private.organization_role(ticket.organization_id) in ('owner', 'admin', 'supervisor')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  update public.conversations set status = 'closed', updated_at = now() where id = conversation;
end $function$;

REVOKE ALL ON FUNCTION private.close_conversation(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.close_conversation(uuid) TO authenticated;

CREATE FUNCTION private.create_organization (
  org_name     text,
  display_name text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

REVOKE ALL ON FUNCTION private.create_organization(text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION private.create_organization(text, text) TO authenticated;

CREATE FUNCTION private.invite_member (
  org          uuid,
  invite_email text,
  invite_role  text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

REVOKE ALL ON FUNCTION private.invite_member(uuid, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION private.invite_member(uuid, text, text) TO authenticated;

CREATE FUNCTION private.is_manager (
  org uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select coalesce(private.organization_role(org) in ('owner', 'admin'), false)
$function$;

REVOKE ALL ON FUNCTION private.is_manager(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.is_manager(uuid) TO authenticated;

CREATE FUNCTION private.organization_role (
  org uuid
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select role from public.memberships
  where organization_id = org and user_id = (select auth.uid()) and active
    and (select auth.uid()) is not null
$function$;

REVOKE ALL ON FUNCTION private.organization_role(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.organization_role(uuid) TO authenticated;

CREATE FUNCTION private.remove_member (
  org    uuid,
  member uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

REVOKE ALL ON FUNCTION private.remove_member(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.remove_member(uuid, uuid) TO authenticated;

CREATE FUNCTION private.revoke_invitation (
  invitation_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare invitation public.invitations;
begin
  select * into invitation from public.invitations where id = invitation_id for update;
  if auth.uid() is null or not private.is_manager(invitation.organization_id) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  update public.invitations set revoked_at = now() where id = invitation_id and accepted_at is null;
end $function$;

REVOKE ALL ON FUNCTION private.revoke_invitation(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.revoke_invitation(uuid) TO authenticated;

CREATE FUNCTION private.shares_organization (
  other_user uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.memberships mine join public.memberships theirs using (organization_id)
    where mine.user_id = (select auth.uid()) and theirs.user_id = other_user and mine.active and theirs.active
  )
$function$;

REVOKE ALL ON FUNCTION private.shares_organization(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.shares_organization(uuid) TO authenticated;

CREATE FUNCTION public.accept_invitation (
  invite_token text,
  display_name text
)
  RETURNS uuid
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.accept_invitation(invite_token, display_name)
$function$;

REVOKE ALL ON FUNCTION public.accept_invitation(text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.accept_invitation(text, text) TO authenticated;

CREATE FUNCTION public.claim_conversation (
  conversation uuid
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.claim_conversation(conversation) $function$;

REVOKE ALL ON FUNCTION public.claim_conversation(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.claim_conversation(uuid) TO authenticated;

CREATE FUNCTION public.close_conversation (
  conversation uuid
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.close_conversation(conversation) $function$;

REVOKE ALL ON FUNCTION public.close_conversation(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.close_conversation(uuid) TO authenticated;

CREATE FUNCTION public.create_organization (
  org_name     text,
  display_name text
)
  RETURNS uuid
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.create_organization(org_name, display_name)
$function$;

REVOKE ALL ON FUNCTION public.create_organization(text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.create_organization(text, text) TO authenticated;

CREATE FUNCTION public.invite_member (
  org          uuid,
  invite_email text,
  invite_role  text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.invite_member(org, invite_email, invite_role)
$function$;

REVOKE ALL ON FUNCTION public.invite_member(uuid, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.invite_member(uuid, text, text) TO authenticated;

CREATE FUNCTION public.remove_member (
  org    uuid,
  member uuid
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.remove_member(org, member) $function$;

REVOKE ALL ON FUNCTION public.remove_member(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.remove_member(uuid, uuid) TO authenticated;

CREATE FUNCTION public.revoke_invitation (
  invitation_id uuid
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.revoke_invitation(invitation_id) $function$;

REVOKE ALL ON FUNCTION public.revoke_invitation(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.revoke_invitation(uuid) TO authenticated;

CREATE TABLE public.contact_tags (
  organization_id uuid NOT NULL,
  contact_id      uuid NOT NULL,
  tag_id          uuid NOT NULL
);

ALTER TABLE public.contact_tags
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_tags
  ADD CONSTRAINT contact_tags_pkey PRIMARY KEY (organization_id, contact_id, tag_id);

GRANT DELETE, INSERT, SELECT ON public.contact_tags TO authenticated;

GRANT ALL ON public.contact_tags TO service_role;

CREATE INDEX contact_tags_tag_idx ON public.contact_tags (organization_id, tag_id);

CREATE POLICY contact_tags_write ON public.contact_tags
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL))
  WITH CHECK ((private.organization_role(organization_id) IS NOT NULL));

CREATE TABLE public.contacts (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  name            text                     NOT NULL,
  phone           text,
  email           text,
  custom_fields   jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.contacts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_name_check CHECK (length(TRIM(BOTH FROM name)) >= 2 AND length(TRIM(BOTH FROM name)) <= 120);

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.contact_tags
  ADD CONSTRAINT contact_tags_organization_id_contact_id_fkey FOREIGN KEY (organization_id, contact_id) REFERENCES public.contacts(organization_id, id) ON DELETE CASCADE;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_organization_id_phone_key UNIQUE (organization_id, phone);

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_phone_check CHECK (phone ~ '^\+?[0-9]{8,15}$'::text);

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);

GRANT DELETE, INSERT, SELECT ON public.contacts TO authenticated;

GRANT UPDATE (custom_fields, email, name, phone, updated_at) ON public.contacts TO authenticated;

GRANT ALL ON public.contacts TO service_role;

CREATE INDEX contacts_org_created_idx ON public.contacts (organization_id, created_at DESC);

CREATE POLICY contacts_delete ON public.contacts
  FOR DELETE
  TO authenticated
  USING (private.is_manager(organization_id));

CREATE POLICY contacts_insert ON public.contacts
  FOR INSERT
  TO authenticated
  WITH CHECK ((private.organization_role(organization_id) IS NOT NULL));

CREATE POLICY contacts_read ON public.contacts
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

CREATE POLICY contacts_update ON public.contacts
  FOR UPDATE
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL))
  WITH CHECK ((private.organization_role(organization_id) IS NOT NULL));

CREATE TABLE public.conversations (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  contact_id      uuid                     NOT NULL,
  team_id         uuid,
  assigned_to     uuid,
  status          text                     DEFAULT 'pending'::text NOT NULL,
  subject         text                     DEFAULT ''::text NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.conversations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_organization_id_contact_id_fkey FOREIGN KEY (organization_id, contact_id) REFERENCES public.contacts(organization_id, id);

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_status_check CHECK (status = ANY (ARRAY['pending'::text, 'open'::text, 'closed'::text]));

GRANT INSERT, SELECT ON public.conversations TO authenticated;

GRANT ALL ON public.conversations TO service_role;

CREATE INDEX conversations_contact_idx ON public.conversations (organization_id, contact_id);

CREATE INDEX conversations_org_status_idx ON public.conversations (organization_id, status, updated_at DESC);

CREATE INDEX conversations_team_idx ON public.conversations (organization_id, team_id);

CREATE INDEX conversations_assignee_idx ON public.conversations (organization_id, assigned_to);

CREATE POLICY conversations_insert ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK ((private.can_access_team(organization_id, team_id) AND (assigned_to IS NULL) AND (status = 'pending'::text)));

CREATE POLICY conversations_read ON public.conversations
  FOR SELECT
  TO authenticated
  USING (private.can_access_team(organization_id, team_id));

CREATE TABLE public.internal_notes (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  conversation_id uuid                     NOT NULL,
  author_id       uuid                     DEFAULT auth.uid() NOT NULL,
  body            text                     NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts, TABLE public.conversations, TABLE public.internal_notes;

ALTER TABLE public.internal_notes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.internal_notes
  ADD CONSTRAINT internal_notes_body_check CHECK (length(TRIM(BOTH FROM body)) >= 1 AND length(TRIM(BOTH FROM body)) <= 10000);

ALTER TABLE public.internal_notes
  ADD CONSTRAINT internal_notes_organization_id_conversation_id_fkey FOREIGN KEY (organization_id, conversation_id) REFERENCES public.conversations(organization_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.internal_notes
  ADD CONSTRAINT internal_notes_pkey PRIMARY KEY (id);

GRANT INSERT, SELECT ON public.internal_notes TO authenticated;

GRANT ALL ON public.internal_notes TO service_role;

CREATE INDEX internal_notes_author_idx ON public.internal_notes (organization_id, author_id);

CREATE INDEX internal_notes_conversation_idx ON public.internal_notes (organization_id, conversation_id, created_at);

CREATE POLICY notes_insert ON public.internal_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND private.can_access_conversation(organization_id, conversation_id)));

CREATE POLICY notes_read ON public.internal_notes
  FOR SELECT
  TO authenticated
  USING (private.can_access_conversation(organization_id, conversation_id));

CREATE TABLE public.invitations (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  email           text                     NOT NULL,
  role            text                     NOT NULL,
  token_hash      text                     NOT NULL,
  created_by      uuid                     NOT NULL,
  expires_at      timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  accepted_at     timestamp with time zone,
  revoked_at      timestamp with time zone,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.invitations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_email_check CHECK (email = lower(TRIM(BOTH FROM email)) AND POSITION(('@'::text) IN (email)) > 1);

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_check CHECK (role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'agent'::text]));

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_token_hash_key UNIQUE (token_hash);

GRANT SELECT ON public.invitations TO authenticated;

GRANT ALL ON public.invitations TO service_role;

CREATE INDEX invitations_creator_idx ON public.invitations (organization_id, created_by);

CREATE INDEX invitations_org_idx ON public.invitations (organization_id, created_at DESC);

CREATE POLICY invitations_read ON public.invitations
  FOR SELECT
  TO authenticated
  USING (private.is_manager(organization_id));

CREATE TABLE public.memberships (
  organization_id uuid                     NOT NULL,
  user_id         uuid                     NOT NULL,
  role            text                     NOT NULL,
  active          boolean                  DEFAULT true NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.memberships
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_pkey PRIMARY KEY (organization_id, user_id);

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_organization_id_assigned_to_fkey FOREIGN KEY (organization_id, assigned_to) REFERENCES public.memberships(organization_id, user_id);

ALTER TABLE public.internal_notes
  ADD CONSTRAINT internal_notes_organization_id_author_id_fkey FOREIGN KEY (organization_id, author_id) REFERENCES public.memberships(organization_id, user_id);

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_organization_id_created_by_fkey FOREIGN KEY (organization_id, created_by) REFERENCES public.memberships(organization_id, user_id);

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_role_check CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'supervisor'::text, 'agent'::text]));

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT SELECT ON public.memberships TO authenticated;

GRANT ALL ON public.memberships TO service_role;

CREATE INDEX memberships_user_idx ON public.memberships (user_id, organization_id);

CREATE POLICY memberships_read ON public.memberships
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

CREATE TABLE public.organizations (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name       text                     NOT NULL,
  timezone   text                     DEFAULT 'America/Porto_Velho'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.organizations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_name_check CHECK (length(TRIM(BOTH FROM name)) >= 2 AND length(TRIM(BOTH FROM name)) <= 120);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

GRANT SELECT ON public.organizations TO authenticated;

GRANT UPDATE (name, timezone) ON public.organizations TO authenticated;

GRANT ALL ON public.organizations TO service_role;

CREATE POLICY organizations_read ON public.organizations
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(id) IS NOT NULL));

CREATE POLICY organizations_update ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (private.is_manager(id))
  WITH CHECK (private.is_manager(id));

CREATE TABLE public.profiles (
  id           uuid                     NOT NULL,
  display_name text                     NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_check CHECK (length(TRIM(BOTH FROM display_name)) >= 2 AND length(TRIM(BOTH FROM display_name)) <= 120);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

GRANT INSERT, SELECT ON public.profiles TO authenticated;

GRANT UPDATE (display_name) ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

CREATE POLICY profiles_read ON public.profiles
  FOR SELECT
  TO authenticated
  USING (((id = ( SELECT auth.uid() AS uid)) OR private.shares_organization(id)));

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

CREATE TABLE public.quick_answers (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  shortcut        text                     NOT NULL,
  body            text                     NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.quick_answers
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.quick_answers
  ADD CONSTRAINT quick_answers_body_check CHECK (length(TRIM(BOTH FROM body)) >= 1 AND length(TRIM(BOTH FROM body)) <= 10000);

ALTER TABLE public.quick_answers
  ADD CONSTRAINT quick_answers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.quick_answers
  ADD CONSTRAINT quick_answers_organization_id_shortcut_key UNIQUE (organization_id, shortcut);

ALTER TABLE public.quick_answers
  ADD CONSTRAINT quick_answers_pkey PRIMARY KEY (id);

ALTER TABLE public.quick_answers
  ADD CONSTRAINT quick_answers_shortcut_check CHECK (length(TRIM(BOTH FROM shortcut)) >= 1 AND length(TRIM(BOTH FROM shortcut)) <= 30);

GRANT DELETE, INSERT, SELECT ON public.quick_answers TO authenticated;

GRANT UPDATE (body, shortcut) ON public.quick_answers TO authenticated;

GRANT ALL ON public.quick_answers TO service_role;

CREATE POLICY quick_answers_read ON public.quick_answers
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

CREATE POLICY quick_answers_write ON public.quick_answers
  TO authenticated
  USING (private.is_manager(organization_id))
  WITH CHECK (private.is_manager(organization_id));

CREATE TABLE public.tags (
  id              uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name            text NOT NULL,
  color           text DEFAULT '#3956ff'::text NOT NULL
);

ALTER TABLE public.tags
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tags
  ADD CONSTRAINT tags_color_check CHECK (color ~ '^#[0-9a-fA-F]{6}$'::text);

ALTER TABLE public.tags
  ADD CONSTRAINT tags_name_check CHECK (length(TRIM(BOTH FROM name)) >= 2 AND length(TRIM(BOTH FROM name)) <= 60);

ALTER TABLE public.tags
  ADD CONSTRAINT tags_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.tags
  ADD CONSTRAINT tags_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.contact_tags
  ADD CONSTRAINT contact_tags_organization_id_tag_id_fkey FOREIGN KEY (organization_id, tag_id) REFERENCES public.tags(organization_id, id) ON DELETE CASCADE;

ALTER TABLE public.tags
  ADD CONSTRAINT tags_organization_id_name_key UNIQUE (organization_id, name);

ALTER TABLE public.tags
  ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

GRANT DELETE, INSERT, SELECT ON public.tags TO authenticated;

GRANT UPDATE (color, name) ON public.tags TO authenticated;

GRANT ALL ON public.tags TO service_role;

CREATE POLICY tags_read ON public.tags
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

CREATE POLICY tags_write ON public.tags
  TO authenticated
  USING (private.is_manager(organization_id))
  WITH CHECK (private.is_manager(organization_id));

CREATE TABLE public.team_members (
  organization_id uuid NOT NULL,
  team_id         uuid NOT NULL,
  user_id         uuid NOT NULL
);

ALTER TABLE public.team_members
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_organization_id_user_id_fkey FOREIGN KEY (organization_id, user_id) REFERENCES public.memberships(organization_id, user_id) ON DELETE CASCADE;

ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_pkey PRIMARY KEY (organization_id, team_id, user_id);

GRANT DELETE, INSERT, SELECT ON public.team_members TO authenticated;

GRANT ALL ON public.team_members TO service_role;

CREATE INDEX team_members_user_idx ON public.team_members (organization_id, user_id);

CREATE POLICY team_members_read ON public.team_members
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

CREATE POLICY team_members_write ON public.team_members
  TO authenticated
  USING (private.is_manager(organization_id))
  WITH CHECK (private.is_manager(organization_id));

CREATE TABLE public.teams (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id  uuid                     NOT NULL,
  name             text                     NOT NULL,
  color            text                     DEFAULT '#3956ff'::text NOT NULL,
  greeting_message text                     DEFAULT ''::text NOT NULL,
  created_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.teams
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_color_check CHECK (color ~ '^#[0-9a-fA-F]{6}$'::text);

ALTER TABLE public.teams
  ADD CONSTRAINT teams_name_check CHECK (length(TRIM(BOTH FROM name)) >= 2 AND length(TRIM(BOTH FROM name)) <= 120);

ALTER TABLE public.teams
  ADD CONSTRAINT teams_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_organization_id_team_id_fkey FOREIGN KEY (organization_id, team_id) REFERENCES public.teams(organization_id, id);

ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_organization_id_team_id_fkey FOREIGN KEY (organization_id, team_id) REFERENCES public.teams(organization_id, id) ON DELETE CASCADE;

ALTER TABLE public.teams
  ADD CONSTRAINT teams_organization_id_name_key UNIQUE (organization_id, name);

ALTER TABLE public.teams
  ADD CONSTRAINT teams_pkey PRIMARY KEY (id);

GRANT DELETE, INSERT, SELECT ON public.teams TO authenticated;

GRANT UPDATE (color, greeting_message, name) ON public.teams TO authenticated;

GRANT ALL ON public.teams TO service_role;

CREATE POLICY teams_read ON public.teams
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

CREATE POLICY teams_write ON public.teams
  TO authenticated
  USING (private.is_manager(organization_id))
  WITH CHECK (private.is_manager(organization_id));