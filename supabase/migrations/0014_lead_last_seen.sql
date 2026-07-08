-- 0014_lead_last_seen.sql — última visita do lead (para ordenar recorrentes no
-- topo). O mesmo TRK (localStorage) reaparece no topo quando o visitante volta.
alter table lead add column if not exists last_seen_at timestamptz;
update lead set last_seen_at =
  coalesce((select max(occurred_at) from event e where e.lead_id = lead.id), created_at)
  where last_seen_at is null;
alter table lead alter column last_seen_at set default now();
create index if not exists lead_last_seen on lead (tenant_id, last_seen_at desc);
