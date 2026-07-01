-- 0008_app_credentials.sql — Credenciais dos apps (client id/secret) por agência.
-- São credenciais do APP parceiro (Nuvemshop/Meta/Google), configuradas uma vez
-- pela agência (um app atende todos os clientes). Secret cifrado em repouso.

create table app_credential (
  agency_id         uuid not null references agency (id) on delete cascade,
  provider          integration_provider not null,
  client_id         text,
  client_secret_enc text,           -- ciphertext em hex
  updated_at        timestamptz not null default now(),
  primary key (agency_id, provider)
);

alter table app_credential enable row level security;

-- agency_admin da agência pode ver/gravar (client_id não é segredo).
create policy app_cred_admin on app_credential
  for all to authenticated
  using (
    agency_id in (select agency_id from membership where user_id = auth.uid() and role = 'agency_admin')
  )
  with check (
    agency_id in (select agency_id from membership where user_id = auth.uid() and role = 'agency_admin')
  );

-- O secret cifrado nunca é lido por papéis de app (apenas service role).
revoke select (client_secret_enc) on app_credential from anon, authenticated;
