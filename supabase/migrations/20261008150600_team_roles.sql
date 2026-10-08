-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION private.set_member_role (
  org      uuid,
  member   uuid,
  new_role text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare member_role text;
begin
  perform 1 from public.organizations where id = org for update;
  select role into member_role from public.memberships where organization_id = org and user_id = member and active;
  if auth.uid() is null or not private.is_manager(org) or member_role is null or member_role = 'owner'
    or member = auth.uid() then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if new_role is null or new_role not in ('admin', 'supervisor', 'agent') then
    raise exception 'Invalid role' using errcode = '23514';
  end if;
  if (new_role = 'admin' or member_role = 'admin') and private.organization_role(org) is distinct from 'owner' then
    raise exception 'Only the owner can change administrators' using errcode = '42501';
  end if;
  update public.memberships set role = new_role where organization_id = org and user_id = member;
end $function$;

REVOKE ALL ON FUNCTION private.set_member_role(uuid, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION private.set_member_role(uuid, uuid, text) TO authenticated;

CREATE FUNCTION public.set_member_role (
  org      uuid,
  member   uuid,
  new_role text
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.set_member_role(org, member, new_role) $function$;

REVOKE ALL ON FUNCTION public.set_member_role(uuid, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.set_member_role(uuid, uuid, text) TO authenticated;
revoke all on function private.set_member_role(uuid, uuid, text) from anon, service_role;
revoke all on function public.set_member_role(uuid, uuid, text) from anon;
