-- 0012_lead_external_id.sql — ID externo do cliente (ex.: customer id do
-- Nuvemshop, window.LS.customer). Usado para resolver nome/email/telefone via
-- API da loja quando o visitante está logado.
alter table lead add column if not exists external_id text;
