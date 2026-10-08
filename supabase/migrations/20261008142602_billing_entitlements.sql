-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION private.assign_organization_slug()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare base text;
begin
  if new.slug is null then
    base := trim(both '-' from regexp_replace(translate(lower(new.name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', '-', 'g'));
    new.slug := left(coalesce(nullif(base, ''), 'empresa'), 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  end if;
  return new;
end $function$;

REVOKE ALL ON FUNCTION private.assign_organization_slug() FROM PUBLIC;

CREATE FUNCTION private.can_write_module (
  org uuid,
  mod text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select private.has_module(org, mod) and (
    private.subscription_access(org) = 'full'
    or exists (select 1 from public.organization_addons a where a.organization_id = org and a.module = mod
      and (a.expires_at is null or a.expires_at > now()))
  )
$function$;

REVOKE ALL ON FUNCTION private.can_write_module(uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION private.can_write_module(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION private.can_write_module(uuid, text) TO service_role;

CREATE FUNCTION private.consume_quota (
  org    uuid,
  metric text,
  amount integer
)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare month date := date_trunc('month', now() at time zone 'UTC')::date; current_used bigint; max_allowed bigint;
begin
  if auth.uid() is not null and private.organization_role(org) is null then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if amount is null or amount < 1 then raise exception 'Invalid amount' using errcode = '23514'; end if;
  insert into public.usage_counters(organization_id, metric, period_start) values (org, metric, month)
    on conflict do nothing;
  select used into current_used from public.usage_counters
    where organization_id = org and usage_counters.metric = consume_quota.metric and period_start = month for update;
  max_allowed := private.org_limit(org, metric);
  if max_allowed is not null and current_used + amount > max_allowed then
    raise exception 'Quota exceeded for %', metric using errcode = '23514';
  end if;
  update public.usage_counters set used = used + amount
    where organization_id = org and usage_counters.metric = consume_quota.metric and period_start = month;
  return case when max_allowed is null then null else max_allowed - current_used - amount end;
end $function$;

REVOKE ALL ON FUNCTION private.consume_quota(uuid, text, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION private.consume_quota(uuid, text, integer) TO authenticated;

GRANT ALL ON FUNCTION private.consume_quota(uuid, text, integer) TO service_role;

CREATE FUNCTION private.enforce_channel_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare max_allowed bigint := private.org_limit(new.organization_id, 'channels');
begin
  if max_allowed is not null then
    perform 1 from public.organizations where id = new.organization_id for update;
    if (select count(*) from public.channels where organization_id = new.organization_id) >= max_allowed then
      raise exception 'Channel limit reached for current plan' using errcode = '23514';
    end if;
  end if;
  return new;
end $function$;

REVOKE ALL ON FUNCTION private.enforce_channel_limit() FROM PUBLIC;

CREATE FUNCTION private.enforce_member_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare max_allowed bigint := private.org_limit(new.organization_id, 'users');
begin
  if new.active and max_allowed is not null and (tg_op = 'INSERT' or not old.active) then
    perform 1 from public.organizations where id = new.organization_id for update;
    if (select count(*) from public.memberships where organization_id = new.organization_id and active
        and user_id <> new.user_id) >= max_allowed then
      raise exception 'User limit reached for current plan' using errcode = '23514';
    end if;
  end if;
  return new;
end $function$;

REVOKE ALL ON FUNCTION private.enforce_member_limit() FROM PUBLIC;

CREATE FUNCTION private.has_module (
  org uuid,
  mod text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select mod = any(private.org_modules(org))
$function$;

REVOKE ALL ON FUNCTION private.has_module(uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION private.has_module(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION private.has_module(uuid, text) TO service_role;

CREATE FUNCTION private.is_platform_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select (select auth.uid()) is not null and exists (select 1 from private.platform_admins where user_id = (select auth.uid()))
$function$;

REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC;

GRANT ALL ON FUNCTION private.is_platform_admin() TO authenticated;

GRANT ALL ON FUNCTION private.is_platform_admin() TO service_role;

CREATE FUNCTION private.my_entitlements (
  org uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare result jsonb;
begin
  if auth.uid() is null or private.organization_role(org) is null then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'access', private.subscription_access(org),
    'modules', to_jsonb(private.org_modules(org)),
    'plan', case when p.id is null then null else jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name,
      'price_cents', p.price_cents, 'billing_interval', p.billing_interval, 'limits', p.limits) end,
    'status', s.status,
    'current_period_end', s.current_period_end,
    'cancel_at_period_end', coalesce(s.cancel_at_period_end, false),
    'pending_plan_id', s.pending_plan_id,
    'trial_used', coalesce(s.trial_used, false)
  ) into result
  from (select org as id) o
  left join public.subscriptions s on s.organization_id = o.id
  left join public.plans p on p.id = s.plan_id;
  return result;
end $function$;

REVOKE ALL ON FUNCTION private.my_entitlements(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.my_entitlements(uuid) TO authenticated;

GRANT ALL ON FUNCTION private.my_entitlements(uuid) TO service_role;

CREATE FUNCTION private.org_limit (
  org       uuid,
  limit_key text
)
  RETURNS bigint
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select nullif(p.limits ->> limit_key, '')::bigint
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.organization_id = org
$function$;

REVOKE ALL ON FUNCTION private.org_limit(uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION private.org_limit(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION private.org_limit(uuid, text) TO service_role;

CREATE FUNCTION private.org_modules (
  org uuid
)
  RETURNS text[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce(array(
    select distinct m from (
      select unnest(p.modules) as m from public.subscriptions s join public.plans p on p.id = s.plan_id
      where s.organization_id = org and private.subscription_access(org) <> 'none'
      union all
      select a.module from public.organization_addons a
      where a.organization_id = org and (a.expires_at is null or a.expires_at > now())
    ) granted order by m
  ), '{}')
$function$;

REVOKE ALL ON FUNCTION private.org_modules(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.org_modules(uuid) TO authenticated;

GRANT ALL ON FUNCTION private.org_modules(uuid) TO service_role;

CREATE FUNCTION private.require_attendance_write()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare org uuid := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
begin
  if (select auth.uid()) is not null and not private.can_write_module(org, 'atendimento') then
    raise exception 'Module not available in current plan' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $function$;

REVOKE ALL ON FUNCTION private.require_attendance_write() FROM PUBLIC;

CREATE FUNCTION private.start_trial (
  org       uuid,
  plan_code text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare target public.plans; existing public.subscriptions;
begin
  if auth.uid() is null or private.organization_role(org) is distinct from 'owner' then
    raise exception 'Only the owner can choose a plan' using errcode = '42501';
  end if;
  select * into target from public.plans where code = plan_code and active and is_public;
  if target.id is null or target.trial_days < 1 then raise exception 'Plan has no trial' using errcode = '23514'; end if;
  select * into existing from public.subscriptions where organization_id = org for update;
  if existing.organization_id is not null then raise exception 'Trial already used' using errcode = '23514'; end if;
  insert into public.subscriptions(organization_id, plan_id, status, current_period_end, trial_used)
    values (org, target.id, 'trialing', now() + make_interval(days => target.trial_days), true);
end $function$;

REVOKE ALL ON FUNCTION private.start_trial(uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION private.start_trial(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION private.start_trial(uuid, text) TO service_role;

CREATE FUNCTION private.subscription_access (
  org uuid
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce((
    select case
      when s.status = 'suspended' then 'none'
      when s.status in ('trialing', 'active') and s.current_period_end > now() then 'full'
      when s.status = 'canceled' and s.current_period_end > now() then 'full'
      when s.status = 'past_due' and s.current_period_end + interval '7 days' > now() then 'full'
      when s.status = 'past_due' then 'read_only'
      else 'none'
    end
    from public.subscriptions s where s.organization_id = org
  ), 'none')
$function$;

REVOKE ALL ON FUNCTION private.subscription_access(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION private.subscription_access(uuid) TO authenticated;

GRANT ALL ON FUNCTION private.subscription_access(uuid) TO service_role;

CREATE TABLE private.billing_events (
  id           text                     NOT NULL,
  provider     text                     NOT NULL,
  payload      jsonb                    NOT NULL,
  received_at  timestamp with time zone DEFAULT now() NOT NULL,
  processed_at timestamp with time zone
);

ALTER TABLE private.billing_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE private.billing_events
  ADD CONSTRAINT billing_events_pkey PRIMARY KEY (id);

GRANT INSERT, SELECT, UPDATE ON private.billing_events TO service_role;

CREATE TABLE private.platform_admins (
  user_id    uuid                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE private.platform_admins
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE private.platform_admins
  ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);

ALTER TABLE private.platform_admins
  ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT SELECT ON private.platform_admins TO service_role;

CREATE FUNCTION public.am_platform_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.is_platform_admin() $function$;

REVOKE ALL ON FUNCTION public.am_platform_admin() FROM PUBLIC;

GRANT ALL ON FUNCTION public.am_platform_admin() TO authenticated;

CREATE FUNCTION public.consume_quota (
  org    uuid,
  metric text,
  amount integer DEFAULT 1
)
  RETURNS bigint
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.consume_quota(org, metric, amount) $function$;

REVOKE ALL ON FUNCTION public.consume_quota(uuid, text, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.consume_quota(uuid, text, integer) TO authenticated;

GRANT ALL ON FUNCTION public.consume_quota(uuid, text, integer) TO service_role;

CREATE FUNCTION public.my_entitlements (
  org uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.my_entitlements(org) $function$;

REVOKE ALL ON FUNCTION public.my_entitlements(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.my_entitlements(uuid) TO authenticated;

CREATE FUNCTION public.start_trial (
  org       uuid,
  plan_code text
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.start_trial(org, plan_code) $function$;

REVOKE ALL ON FUNCTION public.start_trial(uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.start_trial(uuid, text) TO authenticated;

ALTER TABLE public.organizations
  ALTER COLUMN timezone SET DEFAULT 'America/Sao_Paulo'::text;

CREATE TRIGGER channels_limit
  BEFORE INSERT ON public.channels
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_channel_limit();

CREATE TRIGGER channels_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.channels
  FOR EACH ROW
  EXECUTE FUNCTION private.require_attendance_write();

CREATE POLICY channels_module ON public.channels
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'atendimento'::text));

CREATE TRIGGER contact_tags_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.contact_tags
  FOR EACH ROW
  EXECUTE FUNCTION private.require_attendance_write();

CREATE POLICY contact_tags_module ON public.contact_tags
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'atendimento'::text));

CREATE TRIGGER contacts_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION private.require_attendance_write();

CREATE POLICY contacts_module ON public.contacts
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'atendimento'::text));

CREATE TRIGGER conversations_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION private.require_attendance_write();

CREATE POLICY conversations_module ON public.conversations
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'atendimento'::text));

CREATE TRIGGER internal_notes_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.internal_notes
  FOR EACH ROW
  EXECUTE FUNCTION private.require_attendance_write();

CREATE POLICY notes_module ON public.internal_notes
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'atendimento'::text));

CREATE TABLE public.invoices (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  plan_id         uuid                     NOT NULL,
  amount_cents    integer                  NOT NULL,
  status          text                     DEFAULT 'pending'::text NOT NULL,
  method          text                     NOT NULL,
  description     text                     DEFAULT ''::text NOT NULL,
  period_start    timestamp with time zone NOT NULL,
  period_end      timestamp with time zone NOT NULL,
  due_at          timestamp with time zone NOT NULL,
  paid_at         timestamp with time zone,
  efi_charge_id   bigint,
  efi_txid        text,
  payment_url     text,
  pix_copy_paste  text,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.invoices
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_amount_cents_check CHECK (amount_cents >= 0);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_efi_charge_id_key UNIQUE (efi_charge_id);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_efi_txid_key UNIQUE (efi_txid);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_method_check CHECK (method = ANY (ARRAY['pix'::text, 'boleto'::text, 'credit_card'::text, 'manual'::text]));

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'canceled'::text, 'failed'::text, 'refunded'::text]));

GRANT SELECT ON public.invoices TO authenticated;

GRANT ALL ON public.invoices TO service_role;

CREATE INDEX invoices_plan_idx ON public.invoices (plan_id);

CREATE INDEX invoices_org_idx ON public.invoices (organization_id, created_at DESC);

CREATE POLICY invoices_read ON public.invoices
  FOR SELECT
  TO authenticated
  USING (private.is_manager(organization_id));

CREATE TRIGGER memberships_limit
  BEFORE INSERT OR UPDATE OF active ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_member_limit();

CREATE TRIGGER messages_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION private.require_attendance_write();

CREATE POLICY messages_module ON public.messages
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'atendimento'::text));

CREATE TABLE public.modules (
  code        text    NOT NULL,
  name        text    NOT NULL,
  description text    DEFAULT ''::text NOT NULL,
  sort_order  integer DEFAULT 0 NOT NULL
);

ALTER TABLE public.modules
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.modules
  ADD CONSTRAINT modules_code_check CHECK (code ~ '^[a-z_]{2,40}$'::text);

ALTER TABLE public.modules
  ADD CONSTRAINT modules_pkey PRIMARY KEY (code);

GRANT SELECT ON public.modules TO anon;

GRANT SELECT ON public.modules TO authenticated;

GRANT ALL ON public.modules TO service_role;

CREATE POLICY modules_read ON public.modules
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TABLE public.organization_addons (
  organization_id uuid                     NOT NULL,
  module          text                     NOT NULL,
  expires_at      timestamp with time zone,
  note            text                     DEFAULT ''::text NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.organization_addons
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organization_addons
  ADD CONSTRAINT organization_addons_module_fkey FOREIGN KEY (module) REFERENCES public.modules(code);

ALTER TABLE public.organization_addons
  ADD CONSTRAINT organization_addons_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.organization_addons
  ADD CONSTRAINT organization_addons_pkey PRIMARY KEY (organization_id, module);

GRANT SELECT ON public.organization_addons TO authenticated;

GRANT ALL ON public.organization_addons TO service_role;

CREATE INDEX organization_addons_module_idx ON public.organization_addons (module);

CREATE POLICY addons_read ON public.organization_addons
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

ALTER TABLE public.organizations
  ADD COLUMN slug text;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_slug_check CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])?$'::text);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_slug_key UNIQUE (slug);

ALTER TABLE public.organizations
  ADD COLUMN logo_path text;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_logo_path_check CHECK (logo_path IS NULL OR length(logo_path) <= 300);

ALTER TABLE public.organizations
  ADD COLUMN brand_color text DEFAULT '#3956ff'::text NOT NULL;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_brand_color_check CHECK (brand_color ~ '^#[0-9a-fA-F]{6}$'::text);

ALTER TABLE public.organizations
  ADD COLUMN email_domain text;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_email_domain_check CHECK (email_domain IS NULL OR email_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'::text);

REVOKE UPDATE (name, timezone) ON public.organizations FROM authenticated;

GRANT UPDATE (brand_color, email_domain, logo_path, name, timezone) ON public.organizations TO authenticated;

CREATE TRIGGER organizations_slug
  BEFORE INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION private.assign_organization_slug();

CREATE TABLE public.plans (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  code             text                     NOT NULL,
  name             text                     NOT NULL,
  description      text                     DEFAULT ''::text NOT NULL,
  price_cents      integer                  NOT NULL,
  billing_interval text                     DEFAULT 'month'::text NOT NULL,
  modules          text[]                   DEFAULT '{}'::text[] NOT NULL,
  limits           jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  trial_days       integer                  DEFAULT 0 NOT NULL,
  is_public        boolean                  DEFAULT true NOT NULL,
  active           boolean                  DEFAULT true NOT NULL,
  sort_order       integer                  DEFAULT 0 NOT NULL,
  efi_plan_id      bigint,
  created_at       timestamp with time zone DEFAULT now() NOT NULL,
  updated_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.plans
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plans
  ADD CONSTRAINT plans_billing_interval_check CHECK (billing_interval = ANY (ARRAY['month'::text, 'year'::text]));

ALTER TABLE public.plans
  ADD CONSTRAINT plans_code_check CHECK (code ~ '^[a-z0-9-]{2,40}$'::text);

ALTER TABLE public.plans
  ADD CONSTRAINT plans_code_key UNIQUE (code);

ALTER TABLE public.plans
  ADD CONSTRAINT plans_efi_plan_id_key UNIQUE (efi_plan_id);

ALTER TABLE public.plans
  ADD CONSTRAINT plans_limits_check CHECK (jsonb_typeof(limits) = 'object'::text);

ALTER TABLE public.plans
  ADD CONSTRAINT plans_name_check CHECK (length(TRIM(BOTH FROM name)) >= 2 AND length(TRIM(BOTH FROM name)) <= 80);

ALTER TABLE public.plans
  ADD CONSTRAINT plans_pkey PRIMARY KEY (id);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);

ALTER TABLE public.plans
  ADD CONSTRAINT plans_price_cents_check CHECK (price_cents >= 0);

ALTER TABLE public.plans
  ADD CONSTRAINT plans_trial_days_check CHECK (trial_days >= 0 AND trial_days <= 90);

GRANT SELECT ON public.plans TO anon;

GRANT SELECT ON public.plans TO authenticated;

GRANT ALL ON public.plans TO service_role;

CREATE POLICY plans_read ON public.plans
  FOR SELECT
  TO anon, authenticated
  USING ((active AND is_public));

CREATE TRIGGER quick_answers_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.quick_answers
  FOR EACH ROW
  EXECUTE FUNCTION private.require_attendance_write();

CREATE POLICY quick_answers_module ON public.quick_answers
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'atendimento'::text));

CREATE TABLE public.subscriptions (
  organization_id      uuid                     NOT NULL,
  plan_id              uuid                     NOT NULL,
  pending_plan_id      uuid,
  status               text                     NOT NULL,
  payment_method       text,
  current_period_start timestamp with time zone DEFAULT now() NOT NULL,
  current_period_end   timestamp with time zone NOT NULL,
  cancel_at_period_end boolean                  DEFAULT false NOT NULL,
  trial_used           boolean                  DEFAULT false NOT NULL,
  efi_subscription_id  bigint,
  created_at           timestamp with time zone DEFAULT now() NOT NULL,
  updated_at           timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.subscriptions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_efi_subscription_id_key UNIQUE (efi_subscription_id);

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_payment_method_check CHECK (payment_method = ANY (ARRAY['pix'::text, 'boleto'::text, 'credit_card'::text, 'manual'::text]));

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_pending_plan_id_fkey FOREIGN KEY (pending_plan_id) REFERENCES public.plans(id);

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (organization_id);

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check CHECK (status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'suspended'::text]));

GRANT SELECT ON public.subscriptions TO authenticated;

GRANT ALL ON public.subscriptions TO service_role;

CREATE INDEX subscriptions_pending_plan_idx ON public.subscriptions (pending_plan_id);

CREATE INDEX subscriptions_plan_idx ON public.subscriptions (plan_id);

CREATE POLICY subscriptions_read ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

CREATE TRIGGER tags_module
  BEFORE INSERT OR DELETE OR UPDATE ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION private.require_attendance_write();

CREATE POLICY tags_module ON public.tags
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (private.has_module(organization_id, 'atendimento'::text));

CREATE TABLE public.usage_counters (
  organization_id uuid   NOT NULL,
  metric          text   NOT NULL,
  period_start    date   NOT NULL,
  used            bigint DEFAULT 0 NOT NULL
);

ALTER TABLE public.usage_counters
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usage_counters
  ADD CONSTRAINT usage_counters_metric_check CHECK (metric ~ '^[a-z_]{2,40}$'::text);

ALTER TABLE public.usage_counters
  ADD CONSTRAINT usage_counters_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.usage_counters
  ADD CONSTRAINT usage_counters_pkey PRIMARY KEY (organization_id, metric, period_start);

ALTER TABLE public.usage_counters
  ADD CONSTRAINT usage_counters_used_check CHECK (used >= 0);

GRANT SELECT ON public.usage_counters TO authenticated;

GRANT ALL ON public.usage_counters TO service_role;

CREATE POLICY usage_read ON public.usage_counters
  FOR SELECT
  TO authenticated
  USING ((private.organization_role(organization_id) IS NOT NULL));

-- Function privileges (not emitted by declarative sync).
revoke all on function private.subscription_access(uuid), private.org_modules(uuid), private.has_module(uuid, text),
  private.can_write_module(uuid, text), private.org_limit(uuid, text), private.is_platform_admin(),
  private.consume_quota(uuid, text, integer), private.my_entitlements(uuid), private.start_trial(uuid, text),
  private.assign_organization_slug(), private.require_attendance_write(), private.enforce_member_limit(),
  private.enforce_channel_limit() from public, anon, authenticated, service_role;
grant execute on function private.subscription_access(uuid), private.org_modules(uuid), private.has_module(uuid, text),
  private.can_write_module(uuid, text), private.org_limit(uuid, text), private.is_platform_admin(),
  private.consume_quota(uuid, text, integer), private.my_entitlements(uuid), private.start_trial(uuid, text)
  to authenticated, service_role;
revoke all on function public.am_platform_admin(), public.consume_quota(uuid, text, integer),
  public.my_entitlements(uuid), public.start_trial(uuid, text) from public, anon;
grant execute on function public.am_platform_admin(), public.consume_quota(uuid, text, integer),
  public.my_entitlements(uuid), public.start_trial(uuid, text) to authenticated;
grant execute on function public.consume_quota(uuid, text, integer) to service_role;
