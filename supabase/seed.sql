-- seed.sql — dados de desenvolvimento para validar a US1 sem depender da UI.
-- Cria uma agência e um tenant demo com site_key previsível e domínio localhost,
-- permitindo testar POST /api/track imediatamente (ver quickstart.md).

insert into agency (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Demo Agency')
on conflict (id) do nothing;

insert into tenant (id, agency_id, name, site_key)
values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Demo Tenant',
  'pk_live_demo'
)
on conflict (id) do nothing;

insert into tenant_domain (tenant_id, domain)
values
  ('00000000-0000-0000-0000-000000000002', 'localhost'),
  ('00000000-0000-0000-0000-000000000002', '127.0.0.1')
on conflict (tenant_id, domain) do nothing;

-- NOTA: a associação de um usuário (auth.users) como `agency_admin` desta agência
-- deve ser feita após criar o usuário no Supabase Auth:
--   insert into membership (user_id, role, agency_id)
--   values ('<auth-user-id>', 'agency_admin', '00000000-0000-0000-0000-000000000001');
