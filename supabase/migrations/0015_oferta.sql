-- 0015_oferta.sql — Engenheiro de Oferta: ofertas geradas por IA, por loja.
-- Cada linha é uma oferta completa (7 blocos endereçáveis) gerada a partir dos
-- 5 inputs do cliente. Versionada por (tenant, grupo) para permitir regenerar.
create table if not exists oferta (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  -- Inputs do cliente (os 5 campos do protocolo).
  nicho       text not null,
  produto     text not null,
  preco       text not null,
  roma        text not null,
  problema    text not null,
  -- Saída do modelo: markdown bruto + blocos parseados (🪝🏛️📖🥞🛡️⏳❓).
  output_md   text not null default '',
  blocks      jsonb not null default '{}'::jsonb,
  model       text,
  version     int  not null default 1,
  created_at  timestamptz not null default now()
);

create index if not exists oferta_by_tenant on oferta (tenant_id, created_at desc);

-- RLS: isolamento por tenant no nível do banco (não no prompt). Leitura e
-- escrita apenas para tenants visíveis ao usuário (visible_tenant_ids()).
alter table oferta enable row level security;

create policy oferta_tenant_scope on oferta
  for all to authenticated
  using (tenant_id in (select visible_tenant_ids()))
  with check (tenant_id in (select visible_tenant_ids()));
