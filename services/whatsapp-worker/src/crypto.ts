import { supabase, env } from "./supabase.js";

/**
 * Cripto de segredos no worker (FR-021). Mesma abordagem do dashboard:
 * chave passada por argumento a um RPC atômico do Postgres.
 */

export async function encryptSecret(plaintext: string): Promise<string> {
  const { data, error } = await supabase().rpc("encrypt_secret_hex", {
    plaintext,
    key: env.SECRETS_ENCRYPTION_KEY,
  });
  if (error) throw error;
  return data as string;
}

export async function decryptSecret(ciphertextHex: string): Promise<string> {
  const { data, error } = await supabase().rpc("decrypt_secret_hex", {
    ciphertext_hex: ciphertextHex,
    key: env.SECRETS_ENCRYPTION_KEY,
  });
  if (error) throw error;
  return data as string;
}
