-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT subscriptions_status_check;

CREATE FUNCTION private.billing_apply_event (
  event_id         text,
  kind             text,
  org              uuid,
  efi_subscription bigint,
  efi_charge       bigint,
  amount           integer,
  occurred_at      timestamp with time zone,
  payload          jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare sub public.subscriptions; target public.plans; months integer; period_start timestamptz; inserted integer;
begin
  if kind not in ('paid', 'unpaid', 'canceled') then raise exception 'Invalid billing event' using errcode = '23514'; end if;
  insert into private.billing_events(id, provider, payload) values (event_id, 'efi', coalesce(payload, '{}'))
    on conflict (id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return false; end if;
  select * into sub from public.subscriptions s
    where (org is not null and s.organization_id = org) or (efi_subscription is not null and s.efi_subscription_id = efi_subscription)
    order by (s.organization_id = org) desc limit 1 for update;
  if sub.organization_id is null then raise exception 'Subscription not found for billing event' using errcode = '23503'; end if;
  if efi_subscription is not null and sub.efi_subscription_id is distinct from efi_subscription then
    -- Event from a replaced subscription (e.g. after an upgrade): record only.
    update private.billing_events set processed_at = now() where id = event_id;
    return true;
  end if;
  if kind = 'paid' then
    select * into target from public.plans where id = coalesce(sub.pending_plan_id, sub.plan_id);
    months := case when target.billing_interval = 'year' then 12 else 1 end;
    if sub.status in ('active', 'past_due') and sub.current_period_end > coalesce(occurred_at, now()) then
      period_start := sub.current_period_end;
    else
      period_start := coalesce(occurred_at, now());
    end if;
    insert into public.invoices(organization_id, plan_id, amount_cents, status, method, description, period_start, period_end, due_at, paid_at, efi_charge_id)
      values (sub.organization_id, target.id, coalesce(amount, target.price_cents), 'paid', coalesce(sub.payment_method, 'boleto'),
        'Assinatura ' || target.name, period_start, period_start + make_interval(months => months), coalesce(occurred_at, now()), coalesce(occurred_at, now()), efi_charge)
      on conflict (efi_charge_id) do update set status = 'paid', paid_at = excluded.paid_at, updated_at = now();
    update public.subscriptions set plan_id = target.id, pending_plan_id = null, status = 'active',
      current_period_start = period_start, current_period_end = period_start + make_interval(months => months),
      updated_at = now()
      where organization_id = sub.organization_id;
  elsif kind = 'unpaid' then
    update public.invoices set status = 'failed', updated_at = now() where efi_charge_id = efi_charge and status = 'pending';
    update public.subscriptions set status = 'past_due', updated_at = now()
      where organization_id = sub.organization_id and status in ('active', 'trialing', 'incomplete');
  else
    update public.subscriptions set status = 'canceled', cancel_at_period_end = true, updated_at = now()
      where organization_id = sub.organization_id and status <> 'suspended';
  end if;
  update private.billing_events set processed_at = now() where id = event_id;
  return true;
end $function$;

REVOKE ALL ON FUNCTION private.billing_apply_event(text, text, uuid, bigint, bigint, integer, timestamp WITH time zone, jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION private.billing_apply_event(text, text, uuid, bigint, bigint, integer, timestamp WITH time zone, jsonb) TO service_role;

CREATE FUNCTION public.billing_apply_event (
  event_id         text,
  kind             text,
  org              uuid,
  efi_subscription bigint,
  efi_charge       bigint,
  amount           integer,
  occurred_at      timestamp with time zone,
  payload          jsonb
)
  RETURNS boolean
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.billing_apply_event(event_id, kind, org, efi_subscription, efi_charge, amount, occurred_at, payload)
$function$;

REVOKE ALL ON FUNCTION public.billing_apply_event(text, text, uuid, bigint, bigint, integer, timestamp WITH time zone, jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.billing_apply_event(text, text, uuid, bigint, bigint, integer, timestamp WITH time zone, jsonb) TO service_role;

CREATE TABLE public.billing_profiles (
  organization_id uuid                     NOT NULL,
  payer_name      text                     NOT NULL,
  document        text                     NOT NULL,
  email           text                     NOT NULL,
  phone           text                     NOT NULL,
  address         jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.billing_profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.billing_profiles
  ADD CONSTRAINT billing_profiles_address_check CHECK (jsonb_typeof(address) = 'object'::text);

ALTER TABLE public.billing_profiles
  ADD CONSTRAINT billing_profiles_document_check CHECK (document ~ '^([0-9]{11}|[0-9]{14})$'::text);

ALTER TABLE public.billing_profiles
  ADD CONSTRAINT billing_profiles_email_check CHECK (POSITION(('@'::text) IN (email)) > 1);

ALTER TABLE public.billing_profiles
  ADD CONSTRAINT billing_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.billing_profiles
  ADD CONSTRAINT billing_profiles_payer_name_check CHECK (length(TRIM(BOTH FROM payer_name)) >= 2 AND length(TRIM(BOTH FROM payer_name)) <= 120);

ALTER TABLE public.billing_profiles
  ADD CONSTRAINT billing_profiles_phone_check CHECK (phone ~ '^[0-9]{10,11}$'::text);

ALTER TABLE public.billing_profiles
  ADD CONSTRAINT billing_profiles_pkey PRIMARY KEY (organization_id);

GRANT SELECT ON public.billing_profiles TO authenticated;

GRANT ALL ON public.billing_profiles TO service_role;

CREATE POLICY billing_profiles_read ON public.billing_profiles
  FOR SELECT
  TO authenticated
  USING (private.is_manager(organization_id));

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
    CHECK (status = ANY (ARRAY['incomplete'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'suspended'::text]));
-- Explicit: payment events and billing profiles are written only by the server.
revoke all on function private.billing_apply_event(text, text, uuid, bigint, bigint, integer, timestamptz, jsonb) from anon, authenticated;
revoke all on function public.billing_apply_event(text, text, uuid, bigint, bigint, integer, timestamptz, jsonb) from anon, authenticated;
revoke insert, update, delete, maintain, references, trigger, truncate on public.billing_profiles from anon, authenticated;
