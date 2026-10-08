-- Starter plan descriptions mention the CRM (only when the platform admin has not edited them).
update public.plans set description = 'Atendimento multiusuário, CRM de matrículas com proposta de bolsa, departamentos e canais.'
  where code = 'atendimento' and description = 'Atendimento multiusuário com departamentos e canais.';
update public.plans set description = 'CRM de matrículas, atendimento, análise curricular, portal do aluno e grades comerciais.'
  where code = 'completo' and description = 'Atendimento, análise curricular, portal do aluno e grades comerciais.';
