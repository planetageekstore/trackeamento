-- 0001_core.sql — Enums + tabelas de identidade (Agência → Cliente → Usuário)
-- Ver data-model.md. Hierarquia: agency 1─N tenant; membership define escopo/papel.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type role_type as enum ('agency_admin', 'client_user');
create type integration_provider as enum ('meta', 'google', 'nuvemshop', 'whatsapp');
create type integration_status as enum ('connected', 'needs_reconnect', 'revoked', 'error');
create type event_type as enum ('PAGE_VIEW', 'WHATSAPP_CLICK', 'MESSAGE_RECEIVED', 'CHECKOUT', 'PURCHASE', 'LEAD');
create type event_source as enum ('tracker', 'whatsapp', 'nuvemshop', 'system');
create type dispatch_status as enum ('pending', 'sent', 'failed', 'skipped');
create type dispatch_target as enum ('meta_capi', 'google_offline');

-- ---------------------------------------------------------------------------
-- Agência (topo da hierarquia)
-- ---------------------------------------------------------------------------
create table agency (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tenant (Cliente atendido pela agência) — fronteira de isolamento
-- ---------------------------------------------------------------------------
create table tenant (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references agency (id) on delete cascade,
  name               text not null,
  site_key           text not null unique,
  attribution_config jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);
create index tenant_agency_idx on tenant (agency_id);

-- ---------------------------------------------------------------------------
-- Domínios permitidos (allowlist de origem para /api/track)
-- ---------------------------------------------------------------------------
create table tenant_domain (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant (id) on delete cascade,
  domain    text not null,
  unique (tenant_id, domain)
);

-- ---------------------------------------------------------------------------
-- Membership (vínculo de login ↔ escopo)
--   agency_admin: agency_id set, tenant_id null (todos os tenants da agência)
--   client_user:  tenant_id set (apenas o próprio tenant)
-- ---------------------------------------------------------------------------
create table membership (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       role_type not null,
  agency_id  uuid references agency (id) on delete cascade,
  tenant_id  uuid references tenant (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, agency_id, tenant_id),
  constraint membership_scope_ck check (
    (role = 'agency_admin' and agency_id is not null and tenant_id is null)
    or (role = 'client_user' and tenant_id is not null)
  )
);
create index membership_user_idx on membership (user_id);
create index membership_agency_idx on membership (agency_id);
create index membership_tenant_idx on membership (tenant_id);
