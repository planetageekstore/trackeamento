-- 0005_crypto_rpc.sql — RPCs de cripto amigáveis a PostgREST (chave por argumento).
-- Cada chamada é atômica (transação isolada), então a chave é passada junto.
-- Restritos ao service role (revogados de anon/authenticated).

-- Cifra e devolve hex (o backend grava com decode(hex,'hex') na coluna bytea).
create or replace function encrypt_secret_hex(plaintext text, key text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if key is null or key = '' then
    raise exception 'key obrigatória';
  end if;
  if plaintext is null then
    return null;
  end if;
  return encode(pgp_sym_encrypt(plaintext, key), 'hex');
end;
$$;

-- Decifra a partir de um ciphertext em hex.
create or replace function decrypt_secret_hex(ciphertext_hex text, key text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if key is null or key = '' then
    raise exception 'key obrigatória';
  end if;
  if ciphertext_hex is null then
    return null;
  end if;
  return pgp_sym_decrypt(decode(ciphertext_hex, 'hex'), key);
end;
$$;

revoke all on function encrypt_secret_hex(text, text) from public, anon, authenticated;
revoke all on function decrypt_secret_hex(text, text) from public, anon, authenticated;
