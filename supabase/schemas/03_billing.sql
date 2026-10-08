-- Commercial layer: the platform owner sells plans; each organization sees only the modules it contracted.
-- Writes to plans, subscriptions and invoices happen on the server with the service role
-- (platform admin panel and payment webhooks). Members only read their own entitlements.

alter table public.organizations alter column timezone set default 'America/Sao_Paulo';
alter table public.organizations add column slug text unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])?$');
alter table public.organizations add column logo_path text check (logo_path is null or length(logo_path) <= 300);
alter table public.organizations add column brand_color text not null default '#3956ff' check (brand_color ~ '^#[0-9a-fA-F]{6}$');
alter table public.organizations add column email_domain text check (email_domain is null or email_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$');

create table private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.modules (
  code text primary key check (code ~ '^[a-z_]{2,40}$'),
  name text not null,
  description text not null default '',
  sort_order integer not null default 0
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (length(trim(name)) between 2 and 80),
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  modules text[] not null default '{}',
  limits jsonb not null default '{}' check (jsonb_typeof(limits) = 'object'),
  trial_days integer not null default 0 check (trial_days between 0 and 90),
  is_public boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  efi_plan_id bigint unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  -- Downgrades take effect at the end of the paid period.
  pending_plan_id uuid references public.plans(id),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'suspended')),
  payment_method text check (payment_method in ('pix', 'boleto', 'credit_card', 'manual')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  trial_used boolean not null default false,
  efi_subscription_id bigint unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_plan_idx on public.subscriptions(plan_id);
create index subscriptions_pending_plan_idx on public.subscriptions(pending_plan_id);

create table public.organization_addons (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module text not null references public.modules(code),
  expires_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (organization_id, module)
);
create index organization_addons_module_idx on public.organization_addons(module);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'canceled', 'failed', 'refunded')),
  method text not null check (method in ('pix', 'boleto', 'credit_card', 'manual')),
  description text not null default '',
  period_start timestamptz not null,
  period_end timestamptz not null,
  due_at timestamptz not null,
  paid_at timestamptz,
  efi_charge_id bigint unique,
  efi_txid text unique,
  payment_url text,
  pix_copy_paste text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_org_idx on public.invoices(organization_id, created_at desc);
create index invoices_plan_idx on public.invoices(plan_id);

-- Payment provider notifications; the unique id makes webhook processing idempotent.
create table private.billing_events (
  id text primary key,
  provider text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.usage_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric text not null check (metric ~ '^[a-z_]{2,40}$'),
  period_start date not null,
  used bigint not null default 0 check (used >= 0),
  primary key (organization_id, metric, period_start)
);

-- Access state derived from the subscription: full, read_only or none.
create function private.subscription_access(org uuid) returns text
language sql stable security definer set search_path = '' as $$
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
$$;

create function private.org_modules(org uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array(
    select distinct m from (
      select unnest(p.modules) as m from public.subscriptions s join public.plans p on p.id = s.plan_id
      where s.organization_id = org and private.subscription_access(org) <> 'none'
      union all
      select a.module from public.organization_addons a
      where a.organization_id = org and (a.expires_at is null or a.expires_at > now())
    ) granted order by m
  ), '{}')
$$;

create function private.has_module(org uuid, mod text) returns boolean
language sql stable security definer set search_path = '' as $$
  select mod = any(private.org_modules(org))
$$;

create function private.can_write_module(org uuid, mod text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_module(org, mod) and (
    private.subscription_access(org) = 'full'
    or exists (select 1 from public.organization_addons a where a.organization_id = org and a.module = mod
      and (a.expires_at is null or a.expires_at > now()))
  )
$$;

create function private.org_limit(org uuid, limit_key text) returns bigint
language sql stable security definer set search_path = '' as $$
  select nullif(p.limits ->> limit_key, '')::bigint
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.organization_id = org
$$;

create function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (select 1 from private.platform_admins where user_id = (select auth.uid()))
$$;
create function public.am_platform_admin() returns boolean
language sql stable security invoker set search_path = '' as $$ select private.is_platform_admin() $$;

-- Monthly counters. A missing limit means unlimited. Locks the counter row so
-- concurrent requests cannot exceed the plan.
create function private.consume_quota(org uuid, metric text, amount integer) returns bigint
language plpgsql security definer set search_path = '' as $$
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
end $$;
create function public.consume_quota(org uuid, metric text, amount integer default 1) returns bigint
language sql security invoker set search_path = '' as $$ select private.consume_quota(org, metric, amount) $$;

create function private.my_entitlements(org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
end $$;
create function public.my_entitlements(org uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.my_entitlements(org) $$;

-- Trials need no payment; one per organization.
create function private.start_trial(org uuid, plan_code text) returns void
language plpgsql security definer set search_path = '' as $$
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
end $$;
create function public.start_trial(org uuid, plan_code text) returns void
language sql security invoker set search_path = '' as $$ select private.start_trial(org, plan_code) $$;

-- Generates a unique public slug for portals (e.g. /p/escola-modelo-3f9a).
create function private.assign_organization_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
declare base text;
begin
  if new.slug is null then
    base := trim(both '-' from regexp_replace(translate(lower(new.name), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', '-', 'g'));
    new.slug := left(coalesce(nullif(base, ''), 'empresa'), 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  end if;
  return new;
end $$;
create trigger organizations_slug before insert on public.organizations
for each row execute function private.assign_organization_slug();

-- User-initiated writes to attendance data require the module and an active subscription.
-- Service-role writes (provider webhooks) keep flowing so no inbound data is lost.
create function private.require_attendance_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare org uuid := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
begin
  if (select auth.uid()) is not null and not private.can_write_module(org, 'atendimento') then
    raise exception 'Module not available in current plan' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger contacts_module before insert or update or delete on public.contacts
for each row execute function private.require_attendance_write();
create trigger tags_module before insert or update or delete on public.tags
for each row execute function private.require_attendance_write();
create trigger contact_tags_module before insert or update or delete on public.contact_tags
for each row execute function private.require_attendance_write();
create trigger quick_answers_module before insert or update or delete on public.quick_answers
for each row execute function private.require_attendance_write();
create trigger conversations_module before insert or update or delete on public.conversations
for each row execute function private.require_attendance_write();
create trigger internal_notes_module before insert or update or delete on public.internal_notes
for each row execute function private.require_attendance_write();
create trigger channels_module before insert or update or delete on public.channels
for each row execute function private.require_attendance_write();
create trigger messages_module before insert or update or delete on public.messages
for each row execute function private.require_attendance_write();

-- Seat and channel limits come from plan.limits ("users", "channels").
create function private.enforce_member_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
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
end $$;
create trigger memberships_limit before insert or update of active on public.memberships
for each row execute function private.enforce_member_limit();

create function private.enforce_channel_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare max_allowed bigint := private.org_limit(new.organization_id, 'channels');
begin
  if max_allowed is not null then
    perform 1 from public.organizations where id = new.organization_id for update;
    if (select count(*) from public.channels where organization_id = new.organization_id) >= max_allowed then
      raise exception 'Channel limit reached for current plan' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger channels_limit before insert on public.channels
for each row execute function private.enforce_channel_limit();

alter table private.platform_admins enable row level security;
alter table private.billing_events enable row level security;
alter table public.modules enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.organization_addons enable row level security;
alter table public.invoices enable row level security;
alter table public.usage_counters enable row level security;

create policy modules_read on public.modules for select to anon, authenticated using (true);
create policy plans_read on public.plans for select to anon, authenticated using (active and is_public);
create policy subscriptions_read on public.subscriptions for select to authenticated
using (private.organization_role(organization_id) is not null);
create policy addons_read on public.organization_addons for select to authenticated
using (private.organization_role(organization_id) is not null);
create policy invoices_read on public.invoices for select to authenticated
using (private.is_manager(organization_id));
create policy usage_read on public.usage_counters for select to authenticated
using (private.organization_role(organization_id) is not null);

-- Reads of attendance data also require the module (restrictive policies AND with the existing ones).
create policy contacts_module on public.contacts as restrictive for select to authenticated
using (private.has_module(organization_id, 'atendimento'));
create policy tags_module on public.tags as restrictive for select to authenticated
using (private.has_module(organization_id, 'atendimento'));
create policy contact_tags_module on public.contact_tags as restrictive for select to authenticated
using (private.has_module(organization_id, 'atendimento'));
create policy quick_answers_module on public.quick_answers as restrictive for select to authenticated
using (private.has_module(organization_id, 'atendimento'));
create policy conversations_module on public.conversations as restrictive for select to authenticated
using (private.has_module(organization_id, 'atendimento'));
create policy notes_module on public.internal_notes as restrictive for select to authenticated
using (private.has_module(organization_id, 'atendimento'));
create policy channels_module on public.channels as restrictive for select to authenticated
using (private.has_module(organization_id, 'atendimento'));
create policy messages_module on public.messages as restrictive for select to authenticated
using (private.has_module(organization_id, 'atendimento'));

revoke all on public.modules, public.plans, public.subscriptions, public.organization_addons,
  public.invoices, public.usage_counters from public, anon, authenticated;
revoke all on private.platform_admins, private.billing_events from public, anon, authenticated, service_role;
grant select on public.modules, public.plans to anon, authenticated;
grant select on public.subscriptions, public.organization_addons, public.invoices, public.usage_counters to authenticated;
grant all on public.modules, public.plans, public.subscriptions, public.organization_addons,
  public.invoices, public.usage_counters to service_role;
grant select, insert, update on private.billing_events to service_role;
grant select on private.platform_admins to service_role;
grant update (logo_path, brand_color, email_domain) on public.organizations to authenticated;

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
