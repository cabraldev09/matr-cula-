-- Data bootstrap and managed-schema policies not emitted by declarative sync.
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


