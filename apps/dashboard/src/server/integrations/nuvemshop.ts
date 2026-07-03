import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { encryptSecret, decryptSecret } from "@/server/crypto";
import { getAppCredentials } from "@/server/appCredentials";
import { enqueueDispatch } from "@/server/worker";
import { extractTrackingCode } from "@trk/shared";

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

/** Cancela a integração Nuvemshop: remove o webhook order/paid e apaga o registro. */
export async function disconnectNuvemshop(tenantId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { data: integ } = await supabase
    .from("integration")
    .select("account_ref, access_token_enc")
    .eq("tenant_id", tenantId)
    .eq("provider", "nuvemshop")
    .maybeSingle();

  if (integ?.account_ref && integ.access_token_enc) {
    try {
      const token = await decryptSecret(integ.access_token_enc as string);
      const listed = await api(integ.account_ref as string, token, "/webhooks");
      if (listed.ok) {
        const hooks = (await listed.json()) as Array<{ id?: number; event?: string }>;
        for (const h of hooks) {
          if (h.event === "order/paid" && h.id) {
            await api(integ.account_ref as string, token, `/webhooks/${h.id}`, { method: "DELETE" });
          }
        }
      }
    } catch {
      /* best-effort: mesmo que a API falhe, removemos o registro abaixo */
    }
  }

  await supabase.from("integration").delete().eq("tenant_id", tenantId).eq("provider", "nuvemshop");
}

interface NuvemshopCustomer {
  name?: string;
  email?: string;
  phone?: string;
  billing_phone?: string;
  default_address?: { phone?: string };
}

/** Busca um cliente por ID (usado no identify a partir de window.LS.customer). */
export async function fetchCustomer(
  storeId: string | number,
  token: string,
  customerId: string | number,
): Promise<{ name: string | null; email: string | null; phone: string | null } | null> {
  const res = await api(storeId, token, `/customers/${customerId}`);
  if (!res.ok) return null;
  const c = (await res.json()) as NuvemshopCustomer;
  return {
    name: c.name ?? null,
    email: c.email ?? null,
    phone: c.phone ?? c.billing_phone ?? c.default_address?.phone ?? null,
  };
}

/**
 * Resolve nome/email/telefone de um cliente do Nuvemshop (por ID) usando o
 * token salvo da integração do tenant. Retorna null se não houver integração.
 */
export async function resolveNuvemshopCustomer(
  tenantId: string,
  customerId: string | number,
): Promise<{ name: string | null; email: string | null; phone: string | null } | null> {
  const supabase = createSupabaseServiceClient();
  const { data: integ } = await supabase
    .from("integration")
    .select("account_ref, access_token_enc")
    .eq("tenant_id", tenantId)
    .eq("provider", "nuvemshop")
    .maybeSingle();
  if (!integ?.account_ref || !integ.access_token_enc) return null;
  try {
    const token = await decryptSecret(integ.access_token_enc as string);
    return await fetchCustomer(integ.account_ref as string, token, customerId);
  } catch {
    return null;
  }
}

export interface NuvemshopOrder {
  note?: string;
  total?: string;
  currency?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  customer?: { id?: number | string; name?: string; email?: string; phone?: string };
}

/** Busca uma venda para extrair nota/valor + dados do comprador (webhook). */
export async function fetchOrder(
  storeId: string | number,
  token: string,
  orderId: string | number,
): Promise<NuvemshopOrder | null> {
  const res = await api(storeId, token, `/orders/${orderId}`);
  if (!res.ok) return null;
  return (await res.json()) as NuvemshopOrder;
}

/**
 * Grava uma venda paga como PURCHASE, atribuindo ao lead em cascata
 * (TRK na nota → ID do cliente → email) e preenchendo o comprador. Idempotente
 * por order id. Usado tanto pelo webhook quanto pelo polling de sincronização.
 */
export async function recordNuvemshopOrderById(
  tenantId: string,
  storeId: string | number,
  token: string,
  orderId: string | number,
): Promise<"recorded" | "deduped" | "skipped"> {
  const supabase = createSupabaseServiceClient();
  const externalId = `order:${orderId}`;

  const { data: existing } = await supabase
    .from("event")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("source", "nuvemshop")
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing) return "deduped";

  const order = await fetchOrder(storeId, token, orderId);
  if (!order) return "skipped";

  const value = order.total ? Number(order.total) : null;
  const buyerName = order.contact_name ?? order.customer?.name ?? null;
  const buyerEmail = order.contact_email ?? order.customer?.email ?? null;
  const buyerPhone = order.contact_phone ?? order.customer?.phone ?? null;
  const customerId = order.customer?.id != null ? String(order.customer.id) : null;
  const trk = extractTrackingCode(order.note ?? "");

  const findLead = async (column: string, val: string) => {
    const { data } = await supabase
      .from("lead")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq(column, val)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };

  let leadId: string | null = null;
  if (trk) leadId = await findLead("tracking_code", trk);
  if (!leadId && customerId) leadId = await findLead("external_id", customerId);
  if (!leadId && buyerEmail) leadId = await findLead("email", buyerEmail);
  const attributed = Boolean(leadId);

  if (leadId) {
    const fill: Record<string, string> = {};
    if (buyerName) fill.name = buyerName;
    if (buyerEmail) fill.email = buyerEmail;
    if (buyerPhone) fill.phone = buyerPhone;
    if (customerId) fill.external_id = customerId;
    for (const [col, v] of Object.entries(fill)) {
      await supabase.from("lead").update({ [col]: v }).eq("id", leadId).is(col, null);
    }
  }

  const { data: inserted } = await supabase
    .from("event")
    .insert({
      tenant_id: tenantId,
      lead_id: leadId,
      event_type: "PURCHASE",
      source: "nuvemshop",
      external_id: externalId,
      value,
      currency: order.currency ?? "BRL",
      event_data: { order_id: orderId, attributed },
      attributed,
      occurred_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (attributed && inserted) await enqueueDispatch(inserted.id as string);
  return "recorded";
}

/** Sincroniza pedidos PAGOS recentes (últimos 30 dias) e grava os que faltam. */
export async function syncNuvemshopOrders(tenantId: string): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const { data: integ } = await supabase
    .from("integration")
    .select("access_token_enc, account_ref")
    .eq("tenant_id", tenantId)
    .eq("provider", "nuvemshop")
    .maybeSingle();
  if (!integ?.account_ref || !integ.access_token_enc) return 0;

  const token = await decryptSecret(integ.access_token_enc as string);
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const res = await api(
    integ.account_ref as string,
    token,
    `/orders?payment_status=paid&per_page=50&sort_by=created-at-descending&created_at_min=${since}`,
  );
  if (!res.ok) return 0;

  const orders = (await res.json()) as Array<{ id: number | string }>;
  let recorded = 0;
  for (const o of orders) {
    try {
      const r = await recordNuvemshopOrderById(tenantId, integ.account_ref as string, token, o.id);
      if (r === "recorded") recorded += 1;
    } catch {
      /* segue para o próximo pedido */
    }
  }
  return recorded;
}
