-- 0022_crm.sql — CRM: histórico de mudanças de estágio (F9).
-- Cada mudança (IA ou manual) grava uma linha; o gráfico de evolução agrega por
-- dia e por estágio.
create table if not exists lead_stage_history (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  lead_id    uuid not null references lead(id) on delete cascade,
  stage      text not null,
  source     text not null default 'ai',  -- ai | manual
  changed_at timestamptz not null default now()
);

create index if not exists lead_stage_history_by_tenant on lead_stage_history (tenant_id, changed_at);
create index if not exists lead_stage_history_by_lead on lead_stage_history (lead_id, changed_at desc);

alter table lead_stage_history enable row level security;

create policy lead_stage_history_tenant_scope on lead_stage_history
  for all to authenticated
  using (tenant_id in (select visible_tenant_ids()))
  with check (tenant_id in (select visible_tenant_ids()));
