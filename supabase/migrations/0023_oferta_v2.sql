-- 0023_oferta_v2.sql — Engenharia de Oferta reformulada (F10).
-- A oferta ganha tipo (grand slam offer | copy de anúncio) e inputs flexíveis.
-- Biblioteca de notas de copy por tenant (além das notas padrão embutidas no
-- código, que valem para todos).

alter table oferta
  add column if not exists kind   text not null default 'gso',   -- gso | ad_copy
  add column if not exists inputs jsonb not null default '{}'::jsonb;

-- Campos antigos (nicho/produto/preco/roma/problema) viram opcionais: as ofertas
-- novas guardam tudo em `inputs`. Ofertas legadas continuam legíveis.
alter table oferta alter column nicho    drop not null;
alter table oferta alter column produto  drop not null;
alter table oferta alter column preco    drop not null;
alter table oferta alter column roma     drop not null;
alter table oferta alter column problema drop not null;

create table if not exists copy_note (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  title      text not null,
  content    text not null,
  tags       text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists copy_note_by_tenant on copy_note (tenant_id, created_at desc);

alter table copy_note enable row level security;

create policy copy_note_tenant_scope on copy_note
  for all to authenticated
  using (tenant_id in (select visible_tenant_ids()))
  with check (tenant_id in (select visible_tenant_ids()));
