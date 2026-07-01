import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { encryptSecret, decryptSecret } from "@/server/crypto";

const VER = () => process.env.META_API_VERSION ?? "v21.0";
const GRAPH = () => `https://graph.facebook.com/${VER()}`;

export interface MetaInsightRow {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  date_start?: string;
}

export interface CampaignCostRow {
  tenant_id: string;
  provider: "meta" | "google";
  campaign_id: string;
  campaign_name: string | null;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  raw: Record<string, unknown>;
}

/** Transforma insights da Meta em linhas de campaign_cost (função pura, testável). */
export function mapMetaInsightsToCosts(rows: MetaInsightRow[], tenantId: string): CampaignCostRow[] {
  return rows
    .filter((r) => r.campaign_id && r.date_start)
    .map((r) => ({
      tenant_id: tenantId,
      provider: "meta",
      campaign_id: r.campaign_id!,
      campaign_name: r.campaign_name ?? null,
      date: r.date_start!,
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      raw: r as Record<string, unknown>,
    }));
}

/** Troca o code do OAuth por um access token de longa duração. */
export async function exchangeCodeMeta(code: string, redirectUri: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`${GRAPH()}/oauth/access_token?${params}`);
  if (!res.ok) throw new Error(`Meta oauth => ${res.status}`);
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

/** Descobre a primeira conta de anúncios do usuário (account_ref) e o pixel. */
export async function discoverMetaAccount(token: string): Promise<{ adAccountId: string | null; pixelId: string | null }> {
  const acc = await fetch(`${GRAPH()}/me/adaccounts?fields=account_id&access_token=${token}`);
  const adAccountId = acc.ok ? ((await acc.json()).data?.[0]?.account_id ?? null) : null;
  let pixelId: string | null = null;
  if (adAccountId) {
    const px = await fetch(`${GRAPH()}/act_${adAccountId}/adspixels?fields=id&access_token=${token}`);
    if (px.ok) pixelId = (await px.json()).data?.[0]?.id ?? null;
  }
  return { adAccountId, pixelId };
}

/** Persiste a conexão Meta (token cifrado + pixel + ad account). */
export async function connectMeta(tenantId: string, token: string): Promise<void> {
  const { adAccountId, pixelId } = await discoverMetaAccount(token);
  const supabase = createSupabaseServiceClient();
  await supabase.from("integration").upsert(
    {
      tenant_id: tenantId,
      provider: "meta",
      status: "connected",
      account_ref: adAccountId,
      access_token_enc: await encryptSecret(token),
      meta: { pixel_id: pixelId, api_version: VER() },
    },
    { onConflict: "tenant_id,provider" },
  );
}

/**
 * Salva uma conexão Meta a partir de um token colado manualmente (ex.: token
 * de System User do Business Manager, que não expira). Se ad account/pixel não
 * forem informados, tenta descobrir automaticamente. Valida o token antes.
 */
export async function saveMetaToken(
  tenantId: string,
  token: string,
  adAccountId?: string,
  pixelId?: string,
): Promise<{ ok: boolean; adAccountId: string | null; error?: string }> {
  // Valida o token (e descobre conta/pixel se necessário).
  const me = await fetch(`${GRAPH()}/me?access_token=${token}`);
  if (!me.ok) return { ok: false, adAccountId: null, error: "token_invalido" };

  let acc = adAccountId?.replace(/^act_/, "").trim() || null;
  let pixel = pixelId?.trim() || null;
  if (!acc) {
    const discovered = await discoverMetaAccount(token);
    acc = discovered.adAccountId;
    pixel = pixel ?? discovered.pixelId;
  }

  const supabase = createSupabaseServiceClient();
  await supabase.from("integration").upsert(
    {
      tenant_id: tenantId,
      provider: "meta",
      status: "connected",
      account_ref: acc,
      access_token_enc: await encryptSecret(token),
      meta: { pixel_id: pixel, api_version: VER() },
    },
    { onConflict: "tenant_id,provider" },
  );
  return { ok: true, adAccountId: acc };
}

/** Importa custos das últimas N janelas diárias e faz upsert em campaign_cost. */
export async function importMetaCosts(tenantId: string, days = 7): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const { data: integ } = await supabase
    .from("integration")
    .select("access_token_enc, account_ref, status")
    .eq("tenant_id", tenantId)
    .eq("provider", "meta")
    .maybeSingle();
  if (!integ?.account_ref || !integ.access_token_enc) return 0;

  const token = await decryptSecret(integ.access_token_enc as string);
  const url =
    `${GRAPH()}/act_${integ.account_ref}/insights` +
    `?level=campaign&fields=campaign_id,campaign_name,spend,impressions,clicks` +
    `&time_increment=1&date_preset=last_${days}d&access_token=${token}`;

  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401 || res.status === 190) {
      await supabase.from("integration").update({ status: "needs_reconnect" }).eq("tenant_id", tenantId).eq("provider", "meta");
    }
    throw new Error(`Meta insights => ${res.status}`);
  }
  const { data } = (await res.json()) as { data: MetaInsightRow[] };
  const rows = mapMetaInsightsToCosts(data ?? [], tenantId);
  if (rows.length > 0) {
    await supabase.from("campaign_cost").upsert(rows, { onConflict: "tenant_id,provider,campaign_id,date" });
  }
  return rows.length;
}
