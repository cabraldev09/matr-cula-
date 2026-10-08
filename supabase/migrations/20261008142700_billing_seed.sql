-- Module catalog, starter plans (editable in the platform admin panel) and the public branding bucket.
insert into public.modules(code, name, description, sort_order) values
  ('atendimento', 'Atendimento', 'Caixa de entrada, contatos, departamentos, respostas rápidas e canais.', 10),
  ('analise_curricular', 'Análise curricular', 'Leitura de históricos em PDF, grade, dispensas e previsão de conclusão.', 20),
  ('portal_aluno', 'Portal do aluno', 'Área do aluno para enviar documentos e acompanhar solicitações.', 30),
  ('grades_comerciais', 'Grades comerciais', 'Catálogo de matrizes de cursos com resumo para envio.', 40),
  ('chatbot', 'Chatbot', 'Fluxos automáticos de atendimento.', 50),
  ('campanhas', 'Campanhas', 'Envios segmentados e agendados.', 60),
  ('ia', 'Inteligência artificial', 'Sugestões de resposta e assistente com base de conhecimento.', 70),
  ('api', 'API e integrações', 'Tokens de API, webhooks e conectores.', 80)
on conflict (code) do nothing;

insert into public.plans(code, name, description, price_cents, modules, limits, trial_days, sort_order) values
  ('atendimento', 'Atendimento', 'Atendimento multiusuário com departamentos e canais.', 14900,
    array['atendimento'], '{"users": 5, "channels": 1}', 7, 10),
  ('analise', 'Análise curricular', 'Análises curriculares com IA e grades comerciais.', 19900,
    array['analise_curricular', 'grades_comerciais'], '{"users": 5, "analyses": 300}', 7, 20),
  ('completo', 'Completo', 'Atendimento, análise curricular, portal do aluno e grades comerciais.', 34900,
    array['atendimento', 'analise_curricular', 'portal_aluno', 'grades_comerciais'],
    '{"users": 15, "channels": 3, "analyses": 1000}', 7, 30)
on conflict (code) do nothing;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
-- CASE keeps the uuid cast away from objects of other buckets.
create function private.storage_org(object_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when (storage.foldername(object_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(object_name))[1])::uuid end
$$;
revoke all on function private.storage_org(text) from public, anon;
grant execute on function private.storage_org(text) to authenticated, service_role;

create policy branding_write on storage.objects for insert to authenticated
with check (bucket_id = 'branding' and coalesce(private.is_manager(private.storage_org(name)), false));
create policy branding_update on storage.objects for update to authenticated
using (bucket_id = 'branding' and coalesce(private.is_manager(private.storage_org(name)), false));
create policy branding_delete on storage.objects for delete to authenticated
using (bucket_id = 'branding' and coalesce(private.is_manager(private.storage_org(name)), false));

-- Attachments follow the attendance module like the tables they belong to.
create policy attachments_module on storage.objects as restrictive for all to authenticated
using (case when bucket_id = 'attachments' then coalesce(private.has_module(private.storage_org(name), 'atendimento'), false) else true end)
with check (case when bucket_id = 'attachments' then coalesce(private.can_write_module(private.storage_org(name), 'atendimento'), false) else true end);
