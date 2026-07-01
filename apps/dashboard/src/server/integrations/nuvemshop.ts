import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/server/crypto";

const API_BASE = "https://api.tiendanube.com/v1";
const TOKEN_URL = "https://www.tiendanube.com/apps/authorize/token";
const UA = "TrackeamentoSaaS (contato@trackeamento.app)";

interface TokenResponse {
  access_token: string;
  user_id: number;
  scope?: string;
}

/** Troca o `code` do OAuth por access_token + store id. */
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({
      client_id: process.env.NUVEMSHOP_CLIENT_ID,
      client_secret: process.env.NUVEMSHOP_CLIENT_SECRET,
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

/** Injeta o tracker no storefront via POST /scripts (idempotente). */
export async function injectScript(
  storeId: string | number,
  token: string,
  siteKey: string,
): Promise<void> {
  const cdn = process.env.CDN_URL ?? process.env.APP_URL ?? "";
  const src = `${cdn}/t/v1/tracker.js?sk=${siteKey}`;

  const listed = await api(storeId, token, "/scripts");
  if (listed.ok) {
    const scripts = (await listed.json()) as Array<{ src?: string }>;
    if (scripts.some((s) => s.src?.includes("/t/v1/tracker.js"))) return; // já injetado
  }
  await api(storeId, token, "/scripts", {
    method: "POST",
    body: JSON.stringify({ src, event: "onload", where: "store" }),
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

/** Persiste a conexão (token cifrado) e roda injeção de script + webhook. */
export async function connectNuvemshop(tenantId: string, code: string, siteKey: string): Promise<void> {
  const { access_token, user_id } = await exchangeCode(code);
  const supabase = createSupabaseServiceClient();

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

  const webhookUrl = `${process.env.APP_URL}/api/webhooks/nuvemshop`;
  await injectScript(user_id, access_token, siteKey);
  await registerOrderPaidWebhook(user_id, access_token, webhookUrl);
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
