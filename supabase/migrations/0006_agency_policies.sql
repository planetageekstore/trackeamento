-- 0006_agency_policies.sql — Escrita de tenants por agency_admin.
-- Permite que um admin da agência crie/edite os próprios clientes (tenants).
-- (A policy de SELECT `tenant_visible` já existe; políticas permissivas se unem.)

create policy tenant_admin_write on tenant
  for all to authenticated
  using (
    agency_id in (
      select agency_id from membership
      where user_id = auth.uid() and role = 'agency_admin'
    )
  )
  with check (
    agency_id in (
      select agency_id from membership
      where user_id = auth.uid() and role = 'agency_admin'
    )
  );
