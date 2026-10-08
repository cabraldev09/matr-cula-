-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.remove_member (
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
  update public.invitations set revoked_at = now() where organization_id = org and created_by = member and accepted_at is null;
end $function$;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.contact_tags FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.contact_tags FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.contacts FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.contacts FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.conversations FROM anon;

REVOKE INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.conversations FROM authenticated;

GRANT INSERT (contact_id, organization_id, subject, team_id) ON public.conversations TO authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.internal_notes FROM anon;

REVOKE INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.internal_notes FROM authenticated;

GRANT INSERT (author_id, body, conversation_id, organization_id) ON public.internal_notes TO authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.invitations FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.invitations FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.memberships FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.memberships FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.organizations FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.organizations FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.quick_answers FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.quick_answers FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.tags FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.tags FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.team_members FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.team_members FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.teams FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.teams FROM authenticated;