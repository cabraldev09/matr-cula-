-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION private.charge_to_lead()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.lead_events(organization_id, lead_id, kind, payload, actor_id)
    values (new.organization_id, new.lead_id, 'charge', jsonb_build_object('charge_id', new.id, 'method', new.method, 'amount_cents', new.amount_cents), auth.uid());
  return new;
end $function$;

REVOKE ALL ON FUNCTION private.charge_to_lead() FROM PUBLIC;

CREATE FUNCTION private.confirm_enrollment_charge (
  charge     uuid,
  efi_charge bigint
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

REVOKE ALL ON FUNCTION private.confirm_enrollment_charge(uuid, bigint) FROM PUBLIC;

GRANT ALL ON FUNCTION private.confirm_enrollment_charge(uuid, bigint) TO authenticated;

GRANT ALL ON FUNCTION private.confirm_enrollment_charge(uuid, bigint) TO service_role;

CREATE FUNCTION private.lead_from_conversation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.channel_id is not null and private.has_module(new.organization_id, 'crm') then
    insert into public.leads(organization_id, contact_id, source, owner_id)
      values (new.organization_id, new.contact_id, 'whatsapp', new.assigned_to)
      on conflict (organization_id, contact_id) where stage not in ('matriculado', 'perdido') do nothing;
  end if;
  return new;
end $function$;

REVOKE ALL ON FUNCTION private.lead_from_conversation() FROM PUBLIC;

CREATE FUNCTION private.lead_from_message()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare person uuid; found_course uuid; text_norm text;
begin
  if new.direction <> 'incoming' then return new; end if;
  select contact_id into person from public.conversations where id = new.conversation_id;
  if person is null then return new; end if;
  text_norm := ' ' || private.normalize_text(new.body) || ' ';
  select c.id into found_course from public.courses c
    where c.organization_id = new.organization_id and c.active
      and position(' ' || private.normalize_text(c.name) || ' ' in text_norm) > 0
    order by length(c.name) desc limit 1;
  update public.leads set incoming_messages = incoming_messages + 1,
      course_id = coalesce(course_id, found_course)
    where organization_id = new.organization_id and contact_id = person and stage not in ('matriculado', 'perdido');
  return new;
end $function$;

REVOKE ALL ON FUNCTION private.lead_from_message() FROM PUBLIC;

CREATE FUNCTION private.lead_log_changes()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_events(organization_id, lead_id, kind, payload, actor_id)
      values (new.organization_id, new.id, 'created', jsonb_build_object('source', new.source), auth.uid());
  elsif new.stage is distinct from old.stage then
    insert into public.lead_events(organization_id, lead_id, kind, payload, actor_id)
      values (new.organization_id, new.id, 'stage', jsonb_build_object('from', old.stage, 'to', new.stage, 'reason', new.lost_reason), auth.uid());
  end if;
  return new;
end $function$;

REVOKE ALL ON FUNCTION private.lead_log_changes() FROM PUBLIC;

CREATE FUNCTION private.lead_score_fill()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
end $function$;

REVOKE ALL ON FUNCTION private.lead_score_fill() FROM PUBLIC;

CREATE FUNCTION private.normalize_text (
  value text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select trim(regexp_replace(translate(lower(coalesce(value, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g'))
$function$;

REVOKE ALL ON FUNCTION private.normalize_text(text) FROM PUBLIC;

GRANT ALL ON FUNCTION private.normalize_text(text) TO authenticated;

GRANT ALL ON FUNCTION private.normalize_text(text) TO service_role;

CREATE FUNCTION private.proposal_number()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform 1 from public.organizations where id = new.organization_id for update;
  select coalesce(max(number), 0) + 1 into new.number from public.proposals where organization_id = new.organization_id;
  return new;
end $function$;

REVOKE ALL ON FUNCTION private.proposal_number() FROM PUBLIC;

CREATE FUNCTION private.proposal_to_lead()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.lead_id is not null then
    update public.leads set proposal_id = new.id,
        stage = case when stage in ('novo', 'contato', 'qualificado', 'analise') then 'proposta' else stage end
      where organization_id = new.organization_id and id = new.lead_id;
    insert into public.lead_events(organization_id, lead_id, kind, payload, actor_id)
      values (new.organization_id, new.lead_id, 'proposal', jsonb_build_object('proposal_id', new.id, 'number', new.number, 'course', new.course_name), auth.uid());
  end if;
  return new;
end $function$;

REVOKE ALL ON FUNCTION private.proposal_to_lead() FROM PUBLIC;

CREATE FUNCTION private.require_crm_write()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare org uuid := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
begin
  if (select auth.uid()) is not null and not private.can_write_module(org, 'crm') then
    raise exception 'Module not available in current plan' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $function$;

REVOKE ALL ON FUNCTION private.require_crm_write() FROM PUBLIC;

CREATE TABLE private.payment_accounts (
  organization_id             uuid                     NOT NULL,
  efi_client_id               text,
  efi_client_secret_encrypted text,
  efi_secret_iv               text,
  efi_secret_tag              text,
  key_version                 integer,
  sandbox                     boolean                  DEFAULT true NOT NULL,
  webhook_secret              text                     DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
  updated_at                  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE private.payment_accounts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE private.payment_accounts
  ADD CONSTRAINT payment_accounts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE private.payment_accounts
  ADD CONSTRAINT payment_accounts_pkey PRIMARY KEY (organization_id);

CREATE FUNCTION public.confirm_enrollment_charge (
  charge     uuid   DEFAULT NULL::uuid,
  efi_charge bigint DEFAULT NULL::bigint
)
  RETURNS boolean
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.confirm_enrollment_charge(charge, efi_charge) $function$;

REVOKE ALL ON FUNCTION public.confirm_enrollment_charge(uuid, bigint) FROM PUBLIC;

GRANT ALL ON FUNCTION public.confirm_enrollment_charge(uuid, bigint) TO authenticated;

GRANT ALL ON FUNCTION public.confirm_enrollment_charge(uuid, bigint) TO service_role;

CREATE TRIGGER conversations_lead
  AFTER INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION private.lead_from_conversation();

CREATE TABLE public.courses (
  id                          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id             uuid                     NOT NULL,
  name                        text                     NOT NULL,
  modality                    text                     DEFAULT 'EAD - Graduação'::text NOT NULL,
  semesters                   integer                  NOT NULL,
  gross_monthly_cents         integer                  NOT NULL,
  default_first_monthly_cents integer                  NOT NULL,
  active                      boolean                  DEFAULT true NOT NULL,
  created_at                  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.courses
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_check CHECK (default_first_monthly_cents <= gross_monthly_cents);

ALTER TABLE public.courses
  ADD CONSTRAINT courses_default_first_monthly_cents_check CHECK (default_first_monthly_cents > 0);

ALTER TABLE public.courses
  ADD CONSTRAINT courses_gross_monthly_cents_check CHECK (gross_monthly_cents > 0);

ALTER TABLE public.courses
  ADD CONSTRAINT courses_modality_check CHECK (length(TRIM(BOTH FROM modality)) >= 2 AND length(TRIM(BOTH FROM modality)) <= 80);

ALTER TABLE public.courses
  ADD CONSTRAINT courses_name_check CHECK (length(TRIM(BOTH FROM name)) >= 2 AND length(TRIM(BOTH FROM name)) <= 160);

ALTER TABLE public.courses
  ADD CONSTRAINT courses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.courses
  ADD CONSTRAINT courses_organization_id_name_modality_key UNIQUE (organization_id, name, modality);

ALTER TABLE public.courses
  ADD CONSTRAINT courses_pkey PRIMARY KEY (id);

ALTER TABLE public.courses
  ADD CONSTRAINT courses_semesters_check CHECK (semesters >= 1 AND semesters <= 20);

GRANT DELETE, INSERT, SELECT ON public.courses TO authenticated;

GRANT UPDATE (active, default_first_monthly_cents, gross_monthly_cents, modality, name, semesters, updated_at) ON public.courses TO authenticated;

GRANT ALL ON public.courses TO service_role;

CREATE TRIGGER courses_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION private.require_crm_write();

CREATE POLICY courses_module ON public.courses
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'crm'::text));

CREATE POLICY courses_read ON public.courses
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

CREATE POLICY courses_write ON public.courses
  TO authenticated
  USING (private.is_manager(organization_id))
  WITH CHECK (private.is_manager(organization_id));

CREATE TABLE public.enrollment_charges (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  lead_id         uuid                     NOT NULL,
  proposal_id     uuid,
  amount_cents    integer                  NOT NULL,
  method          text                     NOT NULL,
  status          text                     DEFAULT 'pending'::text NOT NULL,
  efi_charge_id   bigint,
  payment_url     text,
  pix_payload     text,
  paid_at         timestamp with time zone,
  confirmed_by    uuid,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.enrollment_charges
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.enrollment_charges
  ADD CONSTRAINT enrollment_charges_amount_cents_check CHECK (amount_cents > 0);

ALTER TABLE public.enrollment_charges
  ADD CONSTRAINT enrollment_charges_efi_charge_id_key UNIQUE (efi_charge_id);

ALTER TABLE public.enrollment_charges
  ADD CONSTRAINT enrollment_charges_method_check CHECK (method = ANY (ARRAY['efi_link'::text, 'pix_manual'::text]));

ALTER TABLE public.enrollment_charges
  ADD CONSTRAINT enrollment_charges_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.enrollment_charges
  ADD CONSTRAINT enrollment_charges_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.enrollment_charges
  ADD CONSTRAINT enrollment_charges_pkey PRIMARY KEY (id);

ALTER TABLE public.enrollment_charges
  ADD CONSTRAINT enrollment_charges_status_check CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'canceled'::text]));

GRANT INSERT (amount_cents, lead_id, method, organization_id, pix_payload, proposal_id) ON public.enrollment_charges TO authenticated;

GRANT SELECT ON public.enrollment_charges TO authenticated;

GRANT ALL ON public.enrollment_charges TO service_role;

CREATE INDEX enrollment_charges_proposal_idx ON public.enrollment_charges (organization_id, proposal_id);

CREATE INDEX enrollment_charges_lead_idx ON public.enrollment_charges (organization_id, lead_id);

CREATE TRIGGER enrollment_charges_lead
  AFTER INSERT ON public.enrollment_charges
  FOR EACH ROW
  EXECUTE FUNCTION private.charge_to_lead();

CREATE TRIGGER enrollment_charges_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.enrollment_charges
  FOR EACH ROW
  EXECUTE FUNCTION private.require_crm_write();

CREATE POLICY charges_insert ON public.enrollment_charges
  FOR INSERT
  TO authenticated
  WITH CHECK (((status = 'pending'::text) AND (method = 'pix_manual'::text) AND (private.organization_role(organization_id) IS NOT NULL)));

CREATE POLICY charges_module ON public.enrollment_charges
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'crm'::text));

CREATE POLICY charges_read ON public.enrollment_charges
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

CREATE TABLE public.lead_events (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  lead_id         uuid                     NOT NULL,
  kind            text                     NOT NULL,
  payload         jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  actor_id        uuid                     DEFAULT auth.uid(),
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.lead_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lead_events
  ADD CONSTRAINT lead_events_kind_check CHECK (kind = ANY (ARRAY['created'::text, 'stage'::text, 'note'::text, 'qualified'::text, 'proposal'::text, 'charge'::text, 'paid'::text]));

ALTER TABLE public.lead_events
  ADD CONSTRAINT lead_events_pkey PRIMARY KEY (id);

GRANT INSERT, SELECT ON public.lead_events TO authenticated;

GRANT ALL ON public.lead_events TO service_role;

CREATE INDEX lead_events_lead_idx ON public.lead_events (organization_id, lead_id, created_at DESC);

CREATE TRIGGER lead_events_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.lead_events
  FOR EACH ROW
  EXECUTE FUNCTION private.require_crm_write();

CREATE POLICY lead_events_insert ON public.lead_events
  FOR INSERT
  TO authenticated
  WITH CHECK (((kind = 'note'::text) AND (actor_id = ( SELECT auth.uid() AS uid)) AND (private.organization_role(organization_id) IS NOT NULL)));

CREATE POLICY lead_events_module ON public.lead_events
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'crm'::text));

CREATE POLICY lead_events_read ON public.lead_events
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

CREATE TABLE public.leads (
  id                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id        uuid                     NOT NULL,
  contact_id             uuid                     NOT NULL,
  owner_id               uuid,
  source                 text                     DEFAULT 'manual'::text NOT NULL,
  stage                  text                     DEFAULT 'novo'::text NOT NULL,
  stage_changed_at       timestamp with time zone DEFAULT now() NOT NULL,
  course_id              uuid,
  modality               text,
  entry_type             text,
  has_previous_studies   boolean,
  education_level        text,
  city                   text,
  start_term             text,
  best_time              text,
  incoming_messages      integer                  DEFAULT 0 NOT NULL,
  score                  integer                  DEFAULT 0 NOT NULL,
  temperature            text                     DEFAULT 'frio'::text NOT NULL,
  lost_reason            text,
  notes                  text                     DEFAULT ''::text NOT NULL,
  curricular_analysis_id uuid,
  proposal_id            uuid,
  created_at             timestamp with time zone DEFAULT now() NOT NULL,
  updated_at             timestamp with time zone DEFAULT now() NOT NULL
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

ALTER TABLE public.leads
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_best_time_check CHECK (best_time IS NULL OR length(best_time) <= 60);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_city_check CHECK (city IS NULL OR length(city) <= 120);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_education_level_check
    CHECK
    (education_level IS NULL OR (education_level = ANY (ARRAY['medio_cursando'::text, 'medio_completo'::text, 'superior_incompleto'::text, 'superior_completo'::text,
    'pos'::text])));

ALTER TABLE public.leads
  ADD CONSTRAINT leads_entry_type_check
    CHECK (entry_type IS NULL OR (entry_type = ANY (ARRAY['vestibular'::text, 'enem'::text, 'transferencia'::text, 'segunda_graduacao'::text, 'retorno'::text])));

ALTER TABLE public.leads
  ADD CONSTRAINT leads_lost_reason_check CHECK (lost_reason IS NULL OR length(lost_reason) <= 300);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_modality_check CHECK (modality IS NULL OR length(modality) <= 80);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_notes_check CHECK (length(notes) <= 5000);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_organization_id_contact_id_fkey FOREIGN KEY (organization_id, contact_id) REFERENCES public.contacts(organization_id, id) ON DELETE CASCADE;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_organization_id_course_id_fkey FOREIGN KEY (organization_id, course_id) REFERENCES public.courses(organization_id, id) ON DELETE SET NULL (course_id);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.enrollment_charges
  ADD CONSTRAINT enrollment_charges_organization_id_lead_id_fkey FOREIGN KEY (organization_id, lead_id) REFERENCES public.leads(organization_id, id) ON DELETE CASCADE;

ALTER TABLE public.lead_events
  ADD CONSTRAINT lead_events_organization_id_lead_id_fkey FOREIGN KEY (organization_id, lead_id) REFERENCES public.leads(organization_id, id) ON DELETE CASCADE;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_organization_id_owner_id_fkey FOREIGN KEY (organization_id, owner_id) REFERENCES public.memberships(organization_id, user_id) ON DELETE SET NULL (owner_id);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_pkey PRIMARY KEY (id);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_score_check CHECK (score >= 0 AND score <= 100);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_check CHECK (source = ANY (ARRAY['whatsapp'::text, 'manual'::text]));

ALTER TABLE public.leads
  ADD CONSTRAINT leads_stage_check
    CHECK (stage = ANY (ARRAY['novo'::text, 'contato'::text, 'qualificado'::text, 'analise'::text, 'proposta'::text, 'taxa_paga'::text, 'matriculado'::text, 'perdido'::text]));

ALTER TABLE public.leads
  ADD CONSTRAINT leads_start_term_check CHECK (start_term IS NULL OR start_term ~ '^[0-9]{4}\.[12]$'::text);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_temperature_check CHECK (temperature = ANY (ARRAY['frio'::text, 'morno'::text, 'quente'::text]));

GRANT DELETE, SELECT ON public.leads TO authenticated;

GRANT INSERT (best_time, city, contact_id, course_id, education_level, entry_type, has_previous_studies, modality, notes, organization_id, owner_id, source, stage, start_term)
  ON public.leads TO authenticated;

GRANT UPDATE (best_time, city, course_id, curricular_analysis_id, education_level, entry_type, has_previous_studies, lost_reason, modality, notes, owner_id, stage, start_term)
  ON public.leads TO authenticated;

GRANT ALL ON public.leads TO service_role;

CREATE UNIQUE INDEX leads_one_open_per_contact ON public.leads (organization_id, contact_id)
  WHERE stage <> ALL (ARRAY['matriculado'::text, 'perdido'::text]);

CREATE INDEX leads_board_idx ON public.leads (organization_id, stage, updated_at DESC);

CREATE INDEX leads_course_idx ON public.leads (organization_id, course_id);

CREATE INDEX leads_owner_idx ON public.leads (organization_id, owner_id);

CREATE INDEX leads_proposal_idx ON public.leads (organization_id, proposal_id);

CREATE TRIGGER leads_log
  AFTER INSERT OR UPDATE OF stage ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION private.lead_log_changes();

CREATE TRIGGER leads_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION private.require_crm_write();

CREATE TRIGGER leads_score
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION private.lead_score_fill();

CREATE POLICY leads_delete ON public.leads
  FOR DELETE
  TO authenticated
  USING (private.is_manager(organization_id));

CREATE POLICY leads_insert ON public.leads
  FOR INSERT
  TO authenticated
  WITH CHECK ((private.organization_role(organization_id) IS NOT NULL));

CREATE POLICY leads_module ON public.leads
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'crm'::text));

CREATE POLICY leads_read ON public.leads
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

CREATE POLICY leads_update ON public.leads
  FOR UPDATE
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL))
  WITH CHECK ((private.organization_role(organization_id) IS NOT NULL));

CREATE TRIGGER messages_lead
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION private.lead_from_message();

CREATE TABLE public.proposal_settings (
  organization_id      uuid                     NOT NULL,
  institution_name     text                     DEFAULT ''::text NOT NULL,
  institution_document text                     DEFAULT ''::text NOT NULL,
  logo_source          text                     DEFAULT 'none'::text NOT NULL,
  logo_path            text,
  rules                jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  projection_note      text                     DEFAULT
    'Apresente ao aluno uma faixa de planejamento: 5% é o cenário anual mínimo e 11% é o teto. A projeção é uma estimativa de planejamento, não uma promessa de mensalidade futura.'::text NOT NULL,
  final_message        text                     DEFAULT 'Condições válidas na data de hoje.'::text NOT NULL,
  pix_key              text,
  pix_merchant_name    text,
  pix_city             text,
  updated_at           timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.proposal_settings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.proposal_settings
  ADD CONSTRAINT proposal_settings_final_message_check CHECK (length(final_message) <= 600);

ALTER TABLE public.proposal_settings
  ADD CONSTRAINT proposal_settings_institution_document_check CHECK (institution_document ~ '^[0-9./ -]{0,24}$'::text);

ALTER TABLE public.proposal_settings
  ADD CONSTRAINT proposal_settings_institution_name_check CHECK (length(institution_name) <= 160);

ALTER TABLE public.proposal_settings
  ADD CONSTRAINT proposal_settings_logo_path_check CHECK (logo_path IS NULL OR length(logo_path) <= 300);

ALTER TABLE public.proposal_settings
  ADD CONSTRAINT proposal_settings_logo_source_check CHECK (logo_source = ANY (ARRAY['upload'::text, 'preset_cruzeiro'::text, 'none'::text]));

ALTER TABLE public.proposal_settings
  ADD CONSTRAINT proposal_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.proposal_settings
  ADD CONSTRAINT proposal_settings_pix_city_check CHECK (pix_city IS NULL OR length(pix_city) <= 40);

ALTER TABLE public.proposal_settings
  ADD CONSTRAINT proposal_settings_pix_key_check CHECK (pix_key IS NULL OR length(pix_key) >= 3 AND length(pix_key) <= 77);

ALTER TABLE public.proposal_settings
  ADD CONSTRAINT proposal_settings_pix_merchant_name_check CHECK (pix_merchant_name IS NULL OR length(pix_merchant_name) <= 60);

ALTER TABLE public.proposal_settings
  ADD CONSTRAINT proposal_settings_pkey PRIMARY KEY (organization_id);

ALTER TABLE public.proposal_settings
  ADD CONSTRAINT proposal_settings_projection_note_check CHECK (length(projection_note) <= 600);

ALTER TABLE public.proposal_settings
  ADD CONSTRAINT proposal_settings_rules_check CHECK (jsonb_typeof(rules) = 'object'::text);

GRANT DELETE, INSERT, SELECT ON public.proposal_settings TO authenticated;

GRANT UPDATE (final_message, institution_document, institution_name, logo_path, logo_source, pix_city, pix_key, pix_merchant_name, projection_note, RULES, updated_at)
  ON public.proposal_settings TO authenticated;

GRANT ALL ON public.proposal_settings TO service_role;

CREATE TRIGGER proposal_settings_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.proposal_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.require_crm_write();

CREATE POLICY proposal_settings_module ON public.proposal_settings
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'crm'::text));

CREATE POLICY proposal_settings_read ON public.proposal_settings
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

CREATE POLICY proposal_settings_write ON public.proposal_settings
  TO authenticated
  USING (private.is_manager(organization_id))
  WITH CHECK (private.is_manager(organization_id));

CREATE TABLE public.proposals (
  id                   uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id      uuid                     NOT NULL,
  lead_id              uuid,
  number               integer                  DEFAULT 0 NOT NULL,
  public_token         text                     DEFAULT encode(extensions.gen_random_bytes(18), 'hex'::text) NOT NULL,
  student_name         text                     NOT NULL,
  course_name          text                     NOT NULL,
  modality             text                     DEFAULT ''::text NOT NULL,
  semesters            integer                  NOT NULL,
  gross_monthly_cents  integer                  NOT NULL,
  first_monthly_cents  integer                  NOT NULL,
  enrollment_fee_cents integer                  NOT NULL,
  start_term           text                     NOT NULL,
  snapshot             jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  status               text                     DEFAULT 'enviada'::text NOT NULL,
  created_by           uuid                     DEFAULT auth.uid(),
  created_at           timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.proposals
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_check CHECK (first_monthly_cents <= gross_monthly_cents);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_course_name_check CHECK (length(TRIM(BOTH FROM course_name)) >= 2 AND length(TRIM(BOTH FROM course_name)) <= 160);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_enrollment_fee_cents_check CHECK (enrollment_fee_cents >= 0);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_first_monthly_cents_check CHECK (first_monthly_cents > 0);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_gross_monthly_cents_check CHECK (gross_monthly_cents > 0);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_modality_check CHECK (length(modality) <= 80);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE public.enrollment_charges
  ADD CONSTRAINT enrollment_charges_organization_id_proposal_id_fkey FOREIGN KEY (organization_id, proposal_id) REFERENCES public.proposals(organization_id, id) ON DELETE
    SET NULL (proposal_id);

ALTER TABLE public.leads
  ADD CONSTRAINT leads_proposal_fkey FOREIGN KEY (organization_id, proposal_id) REFERENCES public.proposals(organization_id, id) ON DELETE SET NULL (proposal_id);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_organization_id_lead_id_fkey FOREIGN KEY (organization_id, lead_id) REFERENCES public.leads(organization_id, id) ON DELETE SET NULL (lead_id);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_organization_id_number_key UNIQUE (organization_id, number);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_pkey PRIMARY KEY (id);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_public_token_key UNIQUE (public_token);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_semesters_check CHECK (semesters >= 1 AND semesters <= 20);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_snapshot_check CHECK (jsonb_typeof(snapshot) = 'object'::text);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_start_term_check CHECK (start_term ~ '^[0-9]{4}\.[12]$'::text);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_status_check CHECK (status = ANY (ARRAY['rascunho'::text, 'enviada'::text, 'aceita'::text, 'cancelada'::text]));

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_student_name_check CHECK (length(TRIM(BOTH FROM student_name)) >= 2 AND length(TRIM(BOTH FROM student_name)) <= 160);

GRANT INSERT
  (course_name, created_by, enrollment_fee_cents, first_monthly_cents, gross_monthly_cents, lead_id, modality, organization_id, semesters, snapshot, start_term, status,
  student_name) ON public.proposals TO authenticated;

GRANT SELECT ON public.proposals TO authenticated;

GRANT UPDATE (status) ON public.proposals TO authenticated;

GRANT ALL ON public.proposals TO service_role;

CREATE INDEX proposals_org_idx ON public.proposals (organization_id, created_at DESC);

CREATE INDEX proposals_lead_idx ON public.proposals (organization_id, lead_id);

CREATE TRIGGER proposals_lead
  AFTER INSERT ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION private.proposal_to_lead();

CREATE TRIGGER proposals_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION private.require_crm_write();

CREATE TRIGGER proposals_number
  BEFORE INSERT ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION private.proposal_number();

CREATE POLICY proposals_insert ON public.proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (private.organization_role(organization_id) IS NOT NULL)));

CREATE POLICY proposals_module ON public.proposals
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'crm'::text));

CREATE POLICY proposals_read ON public.proposals
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

CREATE POLICY proposals_update ON public.proposals
  FOR UPDATE
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL))
  WITH CHECK ((private.organization_role(organization_id) IS NOT NULL));

-- Explicit privileges (repeated from the declarative file so the migration is self-contained).
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

revoke all on function private.normalize_text(text), private.lead_score_fill(), private.lead_log_changes(), private.lead_from_conversation(),
  private.lead_from_message(), private.proposal_number(), private.proposal_to_lead(), private.charge_to_lead(),
  private.require_crm_write(), private.confirm_enrollment_charge(uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function private.confirm_enrollment_charge(uuid, bigint), private.normalize_text(text) to authenticated, service_role;
revoke all on function public.confirm_enrollment_charge(uuid, bigint) from public, anon;
grant execute on function public.confirm_enrollment_charge(uuid, bigint) to authenticated, service_role;

