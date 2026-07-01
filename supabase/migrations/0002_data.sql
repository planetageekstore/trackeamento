-- 0002_data.sql — Tabelas de dados de rastreamento e integrações.
-- Todas carregam tenant_id (fronteira de isolamento). Segredos em colunas *_enc (bytea).

-- ---------------------------------------------------------------------------
-- Lead (o RG único)
-- ---------------------------------------------------------------------------
create table lead (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant (id) on delete cascade,
  tracking_code text not null,
  phone         text,
  email         text,
  created_at    timestamptz not null default now(),
  unique (tenant_id, tracking_code)
);
create index lead_tenant_phone_idx on lead (tenant_id, phone);
create index lead_tenant_created_idx on lead (tenant_id, created_at);

-- ---------------------------------------------------------------------------
-- Click (a origem) — TODOS os toques são preservados (FR-023)
-- ---------------------------------------------------------------------------
create table click (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenant (id) on delete cascade,
  lead_id          uuid not null references lead (id) on delete cascade,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  utm_content      text,
  utm_term         text,
  fbclid           text,
  gclid            text,
  referrer         text,
  landing_page_url text,
  clicked_at       timestamptz not null default now()
);
create index click_lead_idx on click (lead_id, clicked_at);
create index click_tenant_fbclid_idx on click (tenant_id, fbclid);
create index click_tenant_gclid_idx on click (tenant_id, gclid);

-- ---------------------------------------------------------------------------
-- Event (jornada) — idempotência por (tenant_id, source, external_id)
-- ---------------------------------------------------------------------------
create table event (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant (id) on delete cascade,
  lead_id     uuid references lead (id) on delete set null,
  event_type  event_type not null,
  source      event_source not null,
  external_id text,
  value       numeric(14, 2),
  currency    text not null default 'BRL',
  event_data  jsonb not null default '{}'::jsonb,
  attributed  boolean not null default false,
  occurred_at timestamptz not null default now()
);
create index event_lead_idx on event (lead_id, occurred_at);
create index event_tenant_type_idx on event (tenant_id, event_type, occurred_at);
-- Dedup de conversões (FR-014): só aplica quando external_id não é nulo.
create unique index event_dedup_idx on event (tenant_id, source, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------------
-- Integração (conexões de terceiros) — tokens cifrados
-- ---------------------------------------------------------------------------
create table integration (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenant (id) on delete cascade,
  provider          integration_provider not null,
  status            integration_status not null default 'connected',
  account_ref       text,
  access_token_enc  text,   -- ciphertext em hex (pgp_sym_encrypt encode hex)
  refresh_token_enc text,   -- ciphertext em hex
  meta              jsonb not null default '{}'::jsonb,
  expires_at        timestamptz,
  updated_at        timestamptz not null default now(),
  unique (tenant_id, provider)
);

-- ---------------------------------------------------------------------------
-- Instância de WhatsApp (Evolution) — 1 por tenant, apikey cifrada
-- ---------------------------------------------------------------------------
create table whatsapp_instance (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null unique references tenant (id) on delete cascade,
  instance_name text not null,
  apikey_enc    text,   -- ciphertext em hex
  status        text not null default 'close',
  phone_number  text,
  last_seen_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Custo por campanha (importado das plataformas) — upsert idempotente
-- ---------------------------------------------------------------------------
create table campaign_cost (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant (id) on delete cascade,
  provider      integration_provider not null,
  campaign_id   text not null,
  campaign_name text,
  date          date not null,
  spend         numeric(14, 2) not null default 0,
  impressions   bigint not null default 0,
  clicks        bigint not null default 0,
  raw           jsonb not null default '{}'::jsonb,
  unique (tenant_id, provider, campaign_id, date)
);
create index campaign_cost_tenant_date_idx on campaign_cost (tenant_id, date);

-- ---------------------------------------------------------------------------
-- Dispatch de conversão server-side — dedup por (event_id, target)
-- ---------------------------------------------------------------------------
create table conversion_dispatch (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant (id) on delete cascade,
  event_id      uuid not null references event (id) on delete cascade,
  target        dispatch_target not null,
  status        dispatch_status not null default 'pending',
  match_quality text,
  response      jsonb,
  attempts      int not null default 0,
  updated_at    timestamptz not null default now(),
  unique (event_id, target)
);
