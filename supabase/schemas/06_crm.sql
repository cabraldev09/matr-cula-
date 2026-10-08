-- CRM for higher education: leads enter the funnel as soon as a WhatsApp conversation starts, are
-- qualified (course detection and score), receive a scholarship proposal and pay the enrollment fee
-- to the organization (polo). Everything requires the "crm" module.

create function private.normalize_text(value text) returns text
language sql immutable set search_path = '' as $$
  select trim(regexp_replace(translate(lower(coalesce(value, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g'))
$$;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 160),
  modality text not null default 'EAD - Graduação' check (length(trim(modality)) between 2 and 80),
  semesters integer not null check (semesters between 1 and 20),
  gross_monthly_cents integer not null check (gross_monthly_cents > 0),
  default_first_monthly_cents integer not null check (default_first_monthly_cents > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name, modality),
  check (default_first_monthly_cents <= gross_monthly_cents)
);

create table public.proposal_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  institution_name text not null default '' check (length(institution_name) <= 160),
  institution_document text not null default '' check (institution_document ~ '^[0-9./ -]{0,24}$'),
  logo_source text not null default 'none' check (logo_source in ('upload', 'preset_cruzeiro', 'none')),
  logo_path text check (logo_path is null or length(logo_path) <= 300),
  rules jsonb not null default '{}' check (jsonb_typeof(rules) = 'object'),
  projection_note text not null default 'Apresente ao aluno uma faixa de planejamento: 5% é o cenário anual mínimo e 11% é o teto. A projeção é uma estimativa de planejamento, não uma promessa de mensalidade futura.' check (length(projection_note) <= 600),
  final_message text not null default 'Condições válidas na data de hoje.' check (length(final_message) <= 600),
  pix_key text check (pix_key is null or length(pix_key) between 3 and 77),
  pix_merchant_name text check (pix_merchant_name is null or length(pix_merchant_name) <= 60),
  pix_city text check (pix_city is null or length(pix_city) <= 40),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null,
  owner_id uuid,
  source text not null default 'manual' check (source in ('whatsapp', 'manual')),
  stage text not null default 'novo' check (stage in ('novo', 'contato', 'qualificado', 'analise', 'proposta', 'taxa_paga', 'matriculado', 'perdido')),
  stage_changed_at timestamptz not null default now(),
  course_id uuid,
  modality text check (modality is null or length(modality) <= 80),
  entry_type text check (entry_type is null or entry_type in ('vestibular', 'enem', 'transferencia', 'segunda_graduacao', 'retorno')),
  has_previous_studies boolean,
  education_level text check (education_level is null or education_level in ('medio_cursando', 'medio_completo', 'superior_incompleto', 'superior_completo', 'pos')),
  city text check (city is null or length(city) <= 120),
  start_term text check (start_term is null or start_term ~ '^[0-9]{4}\.[12]$'),
  best_time text check (best_time is null or length(best_time) <= 60),
  incoming_messages integer not null default 0,
  score integer not null default 0 check (score between 0 and 100),
  temperature text not null default 'frio' check (temperature in ('frio', 'morno', 'quente')),
  lost_reason text check (lost_reason is null or length(lost_reason) <= 300),
  notes text not null default '' check (length(notes) <= 5000),
  curricular_analysis_id uuid,
  proposal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, contact_id) references public.contacts(organization_id, id) on delete cascade,
  foreign key (organization_id, course_id) references public.courses(organization_id, id) on delete set null (course_id),
  foreign key (organization_id, owner_id) references public.memberships(organization_id, user_id) on delete set null (owner_id)
);
create unique index leads_one_open_per_contact on public.leads(organization_id, contact_id) where stage not in ('matriculado', 'perdido');
create index leads_board_idx on public.leads(organization_id, stage, updated_at desc);
create index leads_course_idx on public.leads(organization_id, course_id);
create index leads_owner_idx on public.leads(organization_id, owner_id);

create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  kind text not null check (kind in ('created', 'stage', 'note', 'qualified', 'proposal', 'charge', 'paid')),
  payload jsonb not null default '{}',
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (organization_id, lead_id) references public.leads(organization_id, id) on delete cascade
);
create index lead_events_lead_idx on public.lead_events(organization_id, lead_id, created_at desc);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid,
  number integer not null default 0,
  public_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  student_name text not null check (length(trim(student_name)) between 2 and 160),
  course_name text not null check (length(trim(course_name)) between 2 and 160),
  modality text not null default '' check (length(modality) <= 80),
  semesters integer not null check (semesters between 1 and 20),
  gross_monthly_cents integer not null check (gross_monthly_cents > 0),
  first_monthly_cents integer not null check (first_monthly_cents > 0),
  enrollment_fee_cents integer not null check (enrollment_fee_cents >= 0),
  start_term text not null check (start_term ~ '^[0-9]{4}\.[12]$'),
  snapshot jsonb not null default '{}' check (jsonb_typeof(snapshot) = 'object'),
  status text not null default 'enviada' check (status in ('rascunho', 'enviada', 'aceita', 'cancelada')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  check (first_monthly_cents <= gross_monthly_cents),
  foreign key (organization_id, lead_id) references public.leads(organization_id, id) on delete set null (lead_id)
);
create index proposals_org_idx on public.proposals(organization_id, created_at desc);
create index proposals_lead_idx on public.proposals(organization_id, lead_id);

alter table public.leads add constraint leads_proposal_fkey foreign key (organization_id, proposal_id) references public.proposals(organization_id, id) on delete set null (proposal_id);
create index leads_proposal_idx on public.leads(organization_id, proposal_id);

create table public.enrollment_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null,
  proposal_id uuid,
  amount_cents integer not null check (amount_cents > 0),
  method text not null check (method in ('efi_link', 'pix_manual')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'canceled')),
  efi_charge_id bigint unique,
  payment_url text,
  pix_payload text,
  paid_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, lead_id) references public.leads(organization_id, id) on delete cascade,
  foreign key (organization_id, proposal_id) references public.proposals(organization_id, id) on delete set null (proposal_id)
);
create index enrollment_charges_lead_idx on public.enrollment_charges(organization_id, lead_id);
create index enrollment_charges_proposal_idx on public.enrollment_charges(organization_id, proposal_id);

-- Polo payment account (Efí). Secrets are encrypted by the app; only the server reads this table.
create table private.payment_accounts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  efi_client_id text,
  efi_client_secret_encrypted text,
  efi_secret_iv text,
  efi_secret_tag text,
  key_version integer,
  sandbox boolean not null default true,
  webhook_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  updated_at timestamptz not null default now()
);

-- Score 0-100 and temperature from the qualification answers and engagement.
create function private.lead_score_fill() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.score := least(100,
    (case when new.course_id is not null then 25 else 0 end) +
    (case when new.modality is not null then 10 else 0 end) +
    (case when new.entry_type is not null then 10 else 0 end) +
    (case when new.has_previous_studies then 15 else 0 end) +
    (case when new.start_term is not null then 15 else 0 end) +
    (case when new.incoming_messages >= 3 then 15 else 0 end) +
    (case when new.proposal_id is not null then 10 else 0 end));
  new.temperature := case when new.score >= 70 then 'quente' when new.score >= 40 then 'morno' else 'frio' end;
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger leads_score before insert or update on public.leads
for each row execute function private.lead_score_fill();

create function private.lead_log_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_events(organization_id, lead_id, kind, payload, actor_id)
      values (new.organization_id, new.id, 'created', jsonb_build_object('source', new.source), auth.uid());
  elsif new.stage is distinct from old.stage then
    insert into public.lead_events(organization_id, lead_id, kind, payload, actor_id)
      values (new.organization_id, new.id, 'stage', jsonb_build_object('from', old.stage, 'to', new.stage, 'reason', new.lost_reason), auth.uid());
  end if;
  return new;
end $$;
create trigger leads_log after insert or update of stage on public.leads
for each row execute function private.lead_log_changes();

-- The lead enters the CRM as soon as a channel conversation starts (WhatsApp webhooks included).
create function private.lead_from_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.channel_id is not null and private.has_module(new.organization_id, 'crm') then
    insert into public.leads(organization_id, contact_id, source, owner_id)
      values (new.organization_id, new.contact_id, 'whatsapp', new.assigned_to)
      on conflict (organization_id, contact_id) where stage not in ('matriculado', 'perdido') do nothing;
  end if;
  return new;
end $$;
create trigger conversations_lead after insert on public.conversations
for each row execute function private.lead_from_conversation();

-- Name used to recognize a course in a message: catalog prefixes such as "CST em" are dropped,
-- since people write only "análise e desenvolvimento de sistemas".
create function private.course_key(name text) returns text language sql immutable set search_path = '' as $$
  select regexp_replace(private.normalize_text(name), '^(cst|curso superior de tecnologia|tecnologo|tecnologia|bacharelado|licenciatura) (em|de) ', '')
$$;

-- Incoming messages count as engagement and reveal the course of interest.
create function private.lead_from_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare person uuid; found_course uuid; text_norm text;
begin
  if new.direction <> 'incoming' then return new; end if;
  select contact_id into person from public.conversations where id = new.conversation_id;
  if person is null then return new; end if;
  text_norm := ' ' || private.normalize_text(new.body) || ' ';
  select c.id into found_course from public.courses c
    where c.organization_id = new.organization_id and c.active
      and position(' ' || private.course_key(c.name) || ' ' in text_norm) > 0
    order by length(private.course_key(c.name)) desc limit 1;
  update public.leads set incoming_messages = incoming_messages + 1,
      course_id = coalesce(course_id, found_course)
    where organization_id = new.organization_id and contact_id = person and stage not in ('matriculado', 'perdido');
  return new;
end $$;
create trigger messages_lead after insert on public.messages
for each row execute function private.lead_from_message();

-- Sequential number per organization (locks the organization row while numbering).
create function private.proposal_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.organizations where id = new.organization_id for update;
  select coalesce(max(number), 0) + 1 into new.number from public.proposals where organization_id = new.organization_id;
  return new;
end $$;
create trigger proposals_number before insert on public.proposals
for each row execute function private.proposal_number();

create function private.proposal_to_lead() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.lead_id is not null then
    update public.leads set proposal_id = new.id,
        stage = case when stage in ('novo', 'contato', 'qualificado', 'analise') then 'proposta' else stage end
      where organization_id = new.organization_id and id = new.lead_id;
    insert into public.lead_events(organization_id, lead_id, kind, payload, actor_id)
      values (new.organization_id, new.lead_id, 'proposal', jsonb_build_object('proposal_id', new.id, 'number', new.number, 'course', new.course_name), auth.uid());
  end if;
  return new;
end $$;
create trigger proposals_lead after insert on public.proposals
for each row execute function private.proposal_to_lead();

create function private.charge_to_lead() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lead_events(organization_id, lead_id, kind, payload, actor_id)
    values (new.organization_id, new.lead_id, 'charge', jsonb_build_object('charge_id', new.id, 'method', new.method, 'amount_cents', new.amount_cents), auth.uid());
  return new;
end $$;
create trigger enrollment_charges_lead after insert on public.enrollment_charges
for each row execute function private.charge_to_lead();

-- Confirms a charge once (manual Pix by the team, or Efí notification by the server) and moves
-- the lead to "taxa_paga". Returns false when it was already paid.
create function private.confirm_enrollment_charge(charge uuid, efi_charge bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare target public.enrollment_charges;
begin
  select * into target from public.enrollment_charges
    where (charge is not null and id = charge) or (efi_charge is not null and efi_charge_id = efi_charge) for update;
  if target.id is null then raise exception 'Charge not found' using errcode = '23503'; end if;
  if auth.uid() is not null and (private.organization_role(target.organization_id) is null
      or not private.can_write_module(target.organization_id, 'crm') or target.method <> 'pix_manual') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if target.status = 'paid' then return false; end if;
  if target.status = 'canceled' then raise exception 'Charge canceled' using errcode = '23514'; end if;
  update public.enrollment_charges set status = 'paid', paid_at = now(), confirmed_by = auth.uid() where id = target.id;
  update public.leads set stage = case when stage in ('matriculado') then stage else 'taxa_paga' end
    where organization_id = target.organization_id and id = target.lead_id;
  insert into public.lead_events(organization_id, lead_id, kind, payload, actor_id)
    values (target.organization_id, target.lead_id, 'paid', jsonb_build_object('charge_id', target.id, 'amount_cents', target.amount_cents, 'method', target.method), auth.uid());
  return true;
end $$;
create function public.confirm_enrollment_charge(charge uuid default null, efi_charge bigint default null) returns boolean
language sql security invoker set search_path = '' as $$ select private.confirm_enrollment_charge(charge, efi_charge) $$;

-- User-initiated writes require the CRM module and an active subscription.
create function private.require_crm_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare org uuid := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
begin
  if (select auth.uid()) is not null and not private.can_write_module(org, 'crm') then
    raise exception 'Module not available in current plan' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger courses_module before insert or update or delete on public.courses for each row execute function private.require_crm_write();
create trigger proposal_settings_module before insert or update or delete on public.proposal_settings for each row execute function private.require_crm_write();
create trigger leads_module before insert or update or delete on public.leads for each row execute function private.require_crm_write();
create trigger lead_events_module before insert or update or delete on public.lead_events for each row execute function private.require_crm_write();
create trigger proposals_module before insert or update or delete on public.proposals for each row execute function private.require_crm_write();
create trigger enrollment_charges_module before insert or update or delete on public.enrollment_charges for each row execute function private.require_crm_write();

alter table public.courses enable row level security;
alter table public.proposal_settings enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.proposals enable row level security;
alter table public.enrollment_charges enable row level security;
alter table private.payment_accounts enable row level security;

create policy courses_read on public.courses for select to authenticated using (private.organization_role(organization_id) is not null);
create policy courses_write on public.courses for all to authenticated using (private.is_manager(organization_id)) with check (private.is_manager(organization_id));
create policy proposal_settings_read on public.proposal_settings for select to authenticated using (private.organization_role(organization_id) is not null);
create policy proposal_settings_write on public.proposal_settings for all to authenticated using (private.is_manager(organization_id)) with check (private.is_manager(organization_id));
create policy leads_read on public.leads for select to authenticated using (private.organization_role(organization_id) is not null);
create policy leads_insert on public.leads for insert to authenticated with check (private.organization_role(organization_id) is not null);
create policy leads_update on public.leads for update to authenticated using (private.organization_role(organization_id) is not null) with check (private.organization_role(organization_id) is not null);
create policy leads_delete on public.leads for delete to authenticated using (private.is_manager(organization_id));
create policy lead_events_read on public.lead_events for select to authenticated using (private.organization_role(organization_id) is not null);
create policy lead_events_insert on public.lead_events for insert to authenticated
  with check (kind = 'note' and actor_id = (select auth.uid()) and private.organization_role(organization_id) is not null);
create policy proposals_read on public.proposals for select to authenticated using (private.organization_role(organization_id) is not null);
create policy proposals_insert on public.proposals for insert to authenticated
  with check (created_by = (select auth.uid()) and private.organization_role(organization_id) is not null);
create policy proposals_update on public.proposals for update to authenticated using (private.organization_role(organization_id) is not null) with check (private.organization_role(organization_id) is not null);
create policy charges_read on public.enrollment_charges for select to authenticated using (private.organization_role(organization_id) is not null);
create policy charges_insert on public.enrollment_charges for insert to authenticated
  with check (status = 'pending' and method = 'pix_manual' and private.organization_role(organization_id) is not null);

create policy courses_module on public.courses as restrictive for select to authenticated using (private.has_module(organization_id, 'crm'));
create policy proposal_settings_module on public.proposal_settings as restrictive for select to authenticated using (private.has_module(organization_id, 'crm'));
create policy leads_module on public.leads as restrictive for select to authenticated using (private.has_module(organization_id, 'crm'));
create policy lead_events_module on public.lead_events as restrictive for select to authenticated using (private.has_module(organization_id, 'crm'));
create policy proposals_module on public.proposals as restrictive for select to authenticated using (private.has_module(organization_id, 'crm'));
create policy charges_module on public.enrollment_charges as restrictive for select to authenticated using (private.has_module(organization_id, 'crm'));

revoke all on public.courses, public.proposal_settings, public.leads, public.lead_events, public.proposals, public.enrollment_charges from public, anon, authenticated;
revoke maintain, references, trigger, truncate on public.courses, public.proposal_settings, public.leads, public.lead_events, public.proposals, public.enrollment_charges from anon, authenticated;
revoke all on private.payment_accounts from public, anon, authenticated, service_role;
grant select, insert, delete on public.courses, public.proposal_settings to authenticated;
grant update (name, modality, semesters, gross_monthly_cents, default_first_monthly_cents, active, updated_at) on public.courses to authenticated;
grant update (institution_name, institution_document, logo_source, logo_path, rules, projection_note, final_message, pix_key, pix_merchant_name, pix_city, updated_at) on public.proposal_settings to authenticated;
grant select, delete on public.leads to authenticated;
grant insert (organization_id, contact_id, owner_id, source, stage, course_id, modality, entry_type, has_previous_studies, education_level, city, start_term, best_time, notes) on public.leads to authenticated;
grant update (owner_id, stage, course_id, modality, entry_type, has_previous_studies, education_level, city, start_term, best_time, lost_reason, notes, curricular_analysis_id) on public.leads to authenticated;
grant select, insert on public.lead_events to authenticated;
grant select on public.proposals to authenticated;
grant insert (organization_id, lead_id, student_name, course_name, modality, semesters, gross_monthly_cents, first_monthly_cents, enrollment_fee_cents, start_term, snapshot, status, created_by) on public.proposals to authenticated;
grant update (status) on public.proposals to authenticated;
grant select on public.enrollment_charges to authenticated;
grant insert (organization_id, lead_id, proposal_id, amount_cents, method, pix_payload) on public.enrollment_charges to authenticated;
grant all on public.courses, public.proposal_settings, public.leads, public.lead_events, public.proposals, public.enrollment_charges to service_role;

revoke all on function private.normalize_text(text), private.course_key(text), private.lead_score_fill(), private.lead_log_changes(), private.lead_from_conversation(),
  private.lead_from_message(), private.proposal_number(), private.proposal_to_lead(), private.charge_to_lead(),
  private.require_crm_write(), private.confirm_enrollment_charge(uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function private.confirm_enrollment_charge(uuid, bigint), private.normalize_text(text), private.course_key(text) to authenticated, service_role;
revoke all on function public.confirm_enrollment_charge(uuid, bigint) from public, anon;
grant execute on function public.confirm_enrollment_charge(uuid, bigint) to authenticated, service_role;

alter publication supabase_realtime add table public.leads;
