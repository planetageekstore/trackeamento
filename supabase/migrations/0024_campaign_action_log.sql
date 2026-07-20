-- 0024_campaign_action_log.sql — Auditoria de ações de escrita nas campanhas (F11).
-- Registra quem pausou/reativou qual objeto (campanha, conjunto ou anúncio) e
-- quando. Essencial em agência com vários usuários.
create table if not exists campaign_action_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  user_id     uuid,
  object_type text not null,           -- campaign | adset | ad
  object_id   text not null,
  object_name text,
  action      text not null,           -- pause | activate
  result      text not null,           -- ok | error
  detail      text,                    -- mensagem de erro, se houver
  created_at  timestamptz not null default now()
);

create index if not exists campaign_action_log_by_tenant on campaign_action_log (tenant_id, created_at desc);

alter table campaign_action_log enable row level security;

create policy campaign_action_log_tenant_scope on campaign_action_log
  for all to authenticated
  using (tenant_id in (select visible_tenant_ids()))
  with check (tenant_id in (select visible_tenant_ids()));
