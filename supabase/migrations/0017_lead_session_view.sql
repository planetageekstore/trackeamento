-- 0017_lead_session_view.sql — Sessões de leads (F3).
-- "Sessão" = lead × dia (fuso America/Sao_Paulo), o mesmo agrupamento que o
-- detalhe do lead já exibe. View com security_invoker para a RLS de `event`
-- continuar valendo (view padrão roda com direitos do dono e vazaria entre
-- tenants).

-- Índice de apoio para varrer eventos por período (compartilhado com F1).
create index if not exists event_tenant_occurred_idx on event (tenant_id, occurred_at);

create or replace view lead_session
  with (security_invoker = true) as
select
  e.tenant_id,
  e.lead_id,
  (e.occurred_at at time zone 'America/Sao_Paulo')::date as session_date,
  min(e.occurred_at) as started_at,
  max(e.occurred_at) as ended_at,
  count(*)           as events_count,
  count(*) filter (where e.event_type = 'PAGE_VIEW')  as pageviews,
  bool_or(e.event_type = 'PURCHASE')                  as has_purchase,
  bool_or(e.event_type in ('WHATSAPP_CLICK', 'MESSAGE_RECEIVED')) as has_whatsapp
from event e
where e.lead_id is not null
group by e.tenant_id, e.lead_id, (e.occurred_at at time zone 'America/Sao_Paulo')::date;
