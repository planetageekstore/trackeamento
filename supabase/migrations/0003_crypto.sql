-- 0003_crypto.sql — Criptografia de segredos em repouso (FR-021, Princípio II).
-- A chave mestra NÃO fica no banco: é lida de um GUC de sessão `app.secrets_key`,
-- setado pelo backend (service role) a partir de uma variável de ambiente / Vault.
--
-- Uso no backend (por conexão/transação):
--   select set_config('app.secrets_key', '<SECRETS_ENCRYPTION_KEY>', true);
--   update integration set access_token_enc = encrypt_secret('token') where ...;
--   select decrypt_secret(access_token_enc) from integration where ...;

create or replace function encrypt_secret(plaintext text)
returns bytea
language plpgsql
as $$
declare
  k text := current_setting('app.secrets_key', true);
begin
  if k is null or k = '' then
    raise exception 'app.secrets_key não configurada na sessão';
  end if;
  if plaintext is null then
    return null;
  end if;
  return pgp_sym_encrypt(plaintext, k);
end;
$$;

create or replace function decrypt_secret(ciphertext bytea)
returns text
language plpgsql
as $$
declare
  k text := current_setting('app.secrets_key', true);
begin
  if k is null or k = '' then
    raise exception 'app.secrets_key não configurada na sessão';
  end if;
  if ciphertext is null then
    return null;
  end if;
  return pgp_sym_decrypt(ciphertext, k);
end;
$$;

-- Segredos jamais devem ser acessíveis por papéis não-privilegiados.
revoke all on function encrypt_secret(text) from public, anon, authenticated;
revoke all on function decrypt_secret(bytea) from public, anon, authenticated;
