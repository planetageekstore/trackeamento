import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { hostFromOrigin, matchDomain } from "./http";

export interface ResolvedTenant {
  id: string;
  site_key: string;
}

/**
 * Resolve o tenant pela site key pública e valida a origem contra a allowlist
 * de domínios (R2). Retorna null se a chave é inválida ou o domínio não é
 * permitido — o caller responde 403 sem vazar detalhes.
 *
 * Usa service role (bypass RLS): é o caminho público de ingestão, responsável
 * por validar o escopo manualmente (Princípio I).
 */
export async function resolveTenant(
  siteKey: string,
  origin: string | null,
): Promise<ResolvedTenant | null> {
  const supabase = createSupabaseServiceClient();

  const { data: tenant } = await supabase
    .from("tenant")
    .select("id, site_key")
    .eq("site_key", siteKey)
    .maybeSingle();

  if (!tenant) return null;

  const host = hostFromOrigin(origin);
  if (host) {
    const { data: domains } = await supabase
      .from("tenant_domain")
      .select("domain")
      .eq("tenant_id", tenant.id);

    const list = domains ?? [];
    // Se o tenant cadastrou domínios, a origem precisa casar um deles.
    if (list.length > 0 && !list.some((d: { domain: string }) => matchDomain(host, d.domain))) {
      return null;
    }
  }

  return tenant as ResolvedTenant;
}

/** Gera uma site key pública (`pk_live_...`). */
export function generateSiteKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `pk_live_${hex}`;
}
