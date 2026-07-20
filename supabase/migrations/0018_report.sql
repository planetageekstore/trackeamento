-- 0018_report.sql — Relatórios de análise por período (F4).
-- Cada linha é um relatório de IA sobre um período, com as métricas congeladas
-- no momento da geração (o relatório histórico não muda se a Meta reprocessar).
create table if not exists report (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenant(id) on delete cascade,
  period_start     date not null,
  period_end       date not null,
  metrics          jsonb not null default '{}'::jsonb,  -- retrato do período
  selected_metrics text[] not null default '{}',        -- métricas escolhidas
  blocks           jsonb not null default '{}'::jsonb,  -- seções da IA (📊✅⚠️🎯)
  manager_opinion  text,                                -- obrigatória p/ salvar
  model            text,
  created_at       timestamptz not null default now()
);

create index if not exists report_by_tenant on report (tenant_id, created_at desc);

alter table report enable row level security;

create policy report_tenant_scope on report
  for all to authenticated
  using (tenant_id in (select visible_tenant_ids()))
  with check (tenant_id in (select visible_tenant_ids()));
