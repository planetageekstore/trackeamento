import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/server/crypto";
import { getAppCredentials } from "@/server/appCredentials";

const API_BASE = "https://api.tiendanube.com/v1";
const TOKEN_URL = "https://www.tiendanube.com/apps/authorize/token";
const UA = "TrackeamentoSaaS (contato@trackeamento.app)";

interface TokenResponse {
  access_token: string;
  user_id: number;
  scope?: string;
}

/** Troca o `code` do OAuth por access_token + store id. */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!res.ok) throw new Error(`Nuvemshop token => ${res.status}`);
  return (await res.json()) as TokenResponse;
}

function api(storeId: string | number, token: string, path: string, init?: RequestInit) {
  return fetch(`${API_BASE}/${storeId}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      authentication: `bearer ${token}`,
      ...init?.headers,
    },
  });
}

/** Registra o webhook order/paid (idempotente). */
export async function registerOrderPaidWebhook(
  storeId: string | number,
  token: string,
  url: string,
): Promise<void> {
  const listed = await api(storeId, token, "/webhooks");
  if (listed.ok) {
    const hooks = (await listed.json()) as Array<{ event?: string; url?: string }>;
    if (hooks.some((h) => h.event === "order/paid" && h.url === url)) return;
  }
  await api(storeId, token, "/webhooks", {
    method: "POST",
    body: JSON.stringify({ event: "order/paid", url }),
  });
}

/**
 * Persiste a conexão (token cifrado) e registra o webhook de venda paga.
 *
 * NOTA: a injeção automática do tracker via `POST /scripts` foi descontinuada
 * pela Nuvemshop (agora exige script registrado no Portal de Parceiros +
 * auto-install). Por isso o tracker é instalado manualmente pelo lojista em
 * Configurações → Códigos externos. Aqui cuidamos apenas do webhook (por API).
 */
export async function connectNuvemshop(tenantId: string, code: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { data: tenant } = await supabase
    .from("tenant")
    .select("agency_id")
    .eq("id", tenantId)
    .maybeSingle();
  const { clientId, clientSecret } = await getAppCredentials(tenant!.agency_id, "nuvemshop");
  if (!clientId || !clientSecret) throw new Error("Credenciais Nuvemshop não configuradas");

  const { access_token, user_id } = await exchangeCode(code, clientId, clientSecret);

  await supabase.from("integration").upsert(
    {
      tenant_id: tenantId,
      provider: "nuvemshop",
      status: "connected",
      account_ref: String(user_id),
      access_token_enc: await encryptSecret(access_token),
      meta: {},
    },
    { onConflict: "tenant_id,provider" },
  );

  // Webhook é best-effort: se falhar, o token já está salvo e reconectar tenta de novo.
  try {
    const webhookUrl = `${process.env.APP_URL}/api/webhooks/nuvemshop`;
    await registerOrderPaidWebhook(user_id, access_token, webhookUrl);
  } catch {
    /* registrado numa próxima reconexão */
  }
}

/** Busca uma venda para extrair nota/valor (usado no webhook). */
export async function fetchOrder(
  storeId: string | number,
  token: string,
  orderId: string | number,
): Promise<{ note?: string; total?: string; currency?: string; contact_email?: string } | null> {
  const res = await api(storeId, token, `/orders/${orderId}`);
  if (!res.ok) return null;
  return (await res.json()) as { note?: string; total?: string; currency?: string; contact_email?: string };
}
