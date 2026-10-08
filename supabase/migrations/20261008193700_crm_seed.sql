-- CRM module in the catalog and in the starter plans that include attendance.
insert into public.modules(code, name, description, sort_order) values
  ('crm', 'CRM de matrículas', 'Funil de leads com qualificação, proposta de bolsa e cobrança da taxa de matrícula.', 15)
on conflict (code) do nothing;
update public.plans set modules = array_append(modules, 'crm')
  where code in ('atendimento', 'completo') and not ('crm' = any(modules));
