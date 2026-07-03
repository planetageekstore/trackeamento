-- 0011_lead_name.sql — nome do lead (capturado via identify() quando o cliente
-- informa os dados: checkout, cadastro, login ou página de confirmação).
-- phone/email já existem em `lead` desde 0002.
alter table lead add column if not exists name text;
