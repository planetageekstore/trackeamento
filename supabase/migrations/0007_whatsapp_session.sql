-- 0007_whatsapp_session.sql — Estado de autenticação do Baileys por tenant.
-- Guarda o "auth state" serializado (creds + keys) para a sessão sobreviver a
-- restart do worker sem pedir QR de novo. Acesso apenas pelo service role
-- (RLS habilitada sem policies) — usuários de app nunca leem as credenciais.

create table whatsapp_session (
  tenant_id  uuid primary key references tenant (id) on delete cascade,
  auth       text,
  updated_at timestamptz not null default now()
);

alter table whatsapp_session enable row level security;
-- Nenhuma policy: somente o service role (bypass RLS) acessa.
