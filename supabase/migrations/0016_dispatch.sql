-- 0016_dispatch.sql — Índices para o envio de conversões (F1).
-- A tabela conversion_dispatch já existe desde 0002; aqui só o índice para a
-- varredura por status. O índice de event(tenant_id, occurred_at) é criado em
-- 0017 (compartilhado).
create index if not exists conversion_dispatch_tenant_status_idx
  on conversion_dispatch (tenant_id, status);
