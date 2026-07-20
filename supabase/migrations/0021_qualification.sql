-- 0021_qualification.sql — Qualificação de leads por IA (F8).
-- A IA lê as conversas de WhatsApp do lead e classifica temperatura/estágio.
-- Histórico completo em lead_qualification; valores materializados no lead para
-- leitura rápida no CRM e no feed de leads.

create table if not exists lead_qualification (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenant(id) on delete cascade,
  lead_id           uuid not null references lead(id) on delete cascade,
  stage             text not null,   -- novo | em_conversa | followup | negociacao | comprou | perdido
  temperature       text not null,   -- quente | morno | frio
  purchase_detected boolean not null default false,
  followup          jsonb not null default '{}'::jsonb,  -- { recomendado, sugestao }
  summary           text,
  confidence        numeric(3,2) not null default 0,
  model             text,
  analyzed_at       timestamptz not null default now()
);

create index if not exists lead_qualification_by_lead on lead_qualification (lead_id, analyzed_at desc);

alter table lead_qualification enable row level security;

create policy lead_qualification_tenant_scope on lead_qualification
  for all to authenticated
  using (tenant_id in (select visible_tenant_ids()))
  with check (tenant_id in (select visible_tenant_ids()));

-- Materializados no lead (leitura rápida).
alter table lead
  add column if not exists stage        text,           -- estágio atual no funil
  add column if not exists temperature  text,           -- quente | morno | frio
  add column if not exists stage_source text default 'ai',  -- ai | manual
  add column if not exists qualified_at timestamptz;    -- última qualificação

create index if not exists lead_stage_idx on lead (tenant_id, stage);
