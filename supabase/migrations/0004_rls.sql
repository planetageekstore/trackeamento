-- 0004_rls.sql — Row-Level Security (Princípio I: isolamento multi-tenant).
-- Toda tabela de dados só é acessível dentro dos tenants visíveis ao usuário.
-- O service role (backend/ingestão pública/webhooks) faz BYPASS de RLS e é
-- responsável por validar site key/domínio/assinatura e setar tenant_id.

-- ---------------------------------------------------------------------------
-- Função de escopo: tenants visíveis ao auth.uid()
--   SECURITY DEFINER evita recursão de RLS ao ler `membership`.
-- ---------------------------------------------------------------------------
create or replace function visible_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- client_user: apenas o próprio tenant
  select m.tenant_id
  from membership m
  where m.user_id = auth.uid()
    and m.role = 'client_user'
    and m.tenant_id is not null
  union
  -- agency_admin: todos os tenants das suas agências
  select t.id
  from tenant t
  join membership m on m.agency_id = t.agency_id
  where m.user_id = auth.uid()
    and m.role = 'agency_admin';
$$;

revoke all on function visible_tenant_ids() from public;
grant execute on function visible_tenant_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Habilita RLS
-- ---------------------------------------------------------------------------
alter table agency               enable row level security;
alter table tenant               enable row level security;
alter table tenant_domain        enable row level security;
alter table membership           enable row level security;
alter table lead                 enable row level security;
alter table click                enable row level security;
alter table event                enable row level security;
alter table integration          enable row level security;
alter table whatsapp_instance    enable row level security;
alter table campaign_cost        enable row level security;
alter table conversion_dispatch  enable row level security;

-- ---------------------------------------------------------------------------
-- membership: o usuário enxerga apenas os próprios vínculos
-- ---------------------------------------------------------------------------
create policy membership_self on membership
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- agency / tenant: visíveis conforme o escopo do usuário
-- ---------------------------------------------------------------------------
create policy agency_visible on agency
  for select to authenticated
  using (
    id in (select agency_id from membership where user_id = auth.uid() and agency_id is not null)
  );

create policy tenant_visible on tenant
  for select to authenticated
  using (id in (select visible_tenant_ids()));

-- ---------------------------------------------------------------------------
-- Tabelas tenant-scoped: policy padrão (SELECT/INSERT/UPDATE/DELETE)
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'tenant_domain', 'lead', 'click', 'event',
    'integration', 'whatsapp_instance', 'campaign_cost', 'conversion_dispatch'
  ]
  loop
    execute format($f$
      create policy %1$s_tenant_scope on %1$s
        for all to authenticated
        using (tenant_id in (select visible_tenant_ids()))
        with check (tenant_id in (select visible_tenant_ids()));
    $f$, tbl);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Proteção adicional: colunas cifradas nunca legíveis por papéis de app.
-- (Ciphertext, mas mantemos fora do alcance mesmo assim.)
-- ---------------------------------------------------------------------------
revoke select (access_token_enc, refresh_token_enc) on integration from anon, authenticated;
revoke select (apikey_enc) on whatsapp_instance from anon, authenticated;
