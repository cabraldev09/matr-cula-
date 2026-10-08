-- Team management by the organization (owner/admin). Same authority rules as invitations:
-- only the owner grants or removes the admin role, and the owner role never changes here.
create function private.set_member_role(org uuid, member uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
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
end $$;
create function public.set_member_role(org uuid, member uuid, new_role text) returns void
language sql security invoker set search_path = '' as $$ select private.set_member_role(org, member, new_role) $$;

revoke all on function private.set_member_role(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.set_member_role(uuid, uuid, text) to authenticated;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
