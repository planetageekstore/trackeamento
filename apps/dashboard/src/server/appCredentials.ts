import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { encryptSecret, decryptSecret } from "@/server/crypto";

type Provider = "meta" | "nuvemshop" | "google";

/**
 * Credenciais do app parceiro (client id/secret) por agência, com fallback para
 * variáveis de ambiente. O secret é decifrado apenas no servidor.
 */
export async function getAppCredentials(
  agencyId: string,
  provider: Provider,
): Promise<{ clientId: string | null; clientSecret: string | null }> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("app_credential")
    .select("client_id, client_secret_enc")
    .eq("agency_id", agencyId)
    .eq("provider", provider)
    .maybeSingle();

  let clientId = data?.client_id ?? null;
  let clientSecret: string | null = null;
  if (data?.client_secret_enc) {
    try {
      clientSecret = await decryptSecret(data.client_secret_enc as string);
    } catch {
      clientSecret = null;
    }
  }

  // Fallback para env (compatibilidade / configuração global).
  const envMap: Record<Provider, { id?: string; secret?: string }> = {
    meta: { id: process.env.META_APP_ID, secret: process.env.META_APP_SECRET },
    nuvemshop: { id: process.env.NUVEMSHOP_CLIENT_ID, secret: process.env.NUVEMSHOP_CLIENT_SECRET },
    google: { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET },
  };
  clientId = clientId ?? envMap[provider].id ?? null;
  clientSecret = clientSecret ?? envMap[provider].secret ?? null;

  return { clientId, clientSecret };
}

/** Lista as credenciais da agência para exibir no painel (sem expor o secret). */
export async function listAppCredentials(
  agencyId: string,
): Promise<Record<string, { clientId: string | null; hasSecret: boolean }>> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("app_credential")
    .select("provider, client_id, client_secret_enc")
    .eq("agency_id", agencyId);
  const out: Record<string, { clientId: string | null; hasSecret: boolean }> = {};
  for (const r of data ?? []) {
    out[r.provider] = { clientId: r.client_id ?? null, hasSecret: Boolean(r.client_secret_enc) };
  }
  return out;
}

/** Salva/atualiza as credenciais do app de um provider (secret cifrado). */
export async function saveAppCredentials(
  agencyId: string,
  provider: Provider,
  clientId: string,
  clientSecret: string | null,
): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const row: Record<string, unknown> = {
    agency_id: agencyId,
    provider,
    client_id: clientId,
    updated_at: new Date().toISOString(),
  };
  // Só sobrescreve o secret se um novo foi informado (permite atualizar só o ID).
  if (clientSecret) row.client_secret_enc = await encryptSecret(clientSecret);

  await supabase.from("app_credential").upsert(row, { onConflict: "agency_id,provider" });
}
