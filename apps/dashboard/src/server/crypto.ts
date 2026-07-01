import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Criptografia de segredos (FR-021 / Princípio II).
 *
 * A cifragem real acontece no Postgres (pgcrypto). A chave mestra
 * (`SECRETS_ENCRYPTION_KEY`) é passada como argumento em uma ÚNICA chamada RPC
 * — assim funciona sob PostgREST (cada RPC é uma transação isolada) e o segredo
 * em claro nunca é persistido em logs nem retornado ao browser.
 *
 * RPCs correspondentes: `encrypt_secret_hex(plaintext, key)` e
 * `decrypt_secret_hex(ciphertext_hex, key)` (migration 0005), restritos ao
 * service role.
 */

function secretsKey(): string {
  const k = process.env.SECRETS_ENCRYPTION_KEY;
  if (!k) throw new Error("SECRETS_ENCRYPTION_KEY ausente");
  return k;
}

/** Retorna o ciphertext em hex; grave-o via `decode(<hex>, 'hex')` na coluna bytea. */
export async function encryptSecret(plaintext: string): Promise<string> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("encrypt_secret_hex", {
    plaintext,
    key: secretsKey(),
  });
  if (error) throw error;
  return data as string;
}

/** Decifra um ciphertext previamente lido como hex (`encode(col, 'hex')`). Só servidor. */
export async function decryptSecret(ciphertextHex: string): Promise<string> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("decrypt_secret_hex", {
    ciphertext_hex: ciphertextHex,
    key: secretsKey(),
  });
  if (error) throw error;
  return data as string;
}
