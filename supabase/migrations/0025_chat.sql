-- 0025_chat.sql — Chat com IA por cliente (F5).
-- Conversas e mensagens por tenant. content guarda os blocos da API (texto) para
-- reconstruir a conversa ao retomar.
create table if not exists chat_conversation (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenant(id) on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_conversation_by_tenant on chat_conversation (tenant_id, updated_at desc);

create table if not exists chat_message (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversation(id) on delete cascade,
  tenant_id       uuid not null references tenant(id) on delete cascade,
  role            text not null,            -- user | assistant
  content         jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists chat_message_by_conversation on chat_message (conversation_id, created_at);

alter table chat_conversation enable row level security;
alter table chat_message enable row level security;

create policy chat_conversation_tenant_scope on chat_conversation
  for all to authenticated
  using (tenant_id in (select visible_tenant_ids()))
  with check (tenant_id in (select visible_tenant_ids()));

create policy chat_message_tenant_scope on chat_message
  for all to authenticated
  using (tenant_id in (select visible_tenant_ids()))
  with check (tenant_id in (select visible_tenant_ids()));
