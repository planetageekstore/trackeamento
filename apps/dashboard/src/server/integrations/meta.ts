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
export async function exchangeCodeMeta(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
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

async function metaToken(
  tenantId: string,
): Promise<{ token: string; accountRef: string | null } | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("integration")
    .select("access_token_enc, account_ref")
    .eq("tenant_id", tenantId)
    .eq("provider", "meta")
    .maybeSingle();
  if (!data?.access_token_enc) return null;
  return { token: await decryptSecret(data.access_token_enc as string), accountRef: data.account_ref };
}

/** Lista as contas de anúncios (BMs) que o token acessa. */
export async function listAdAccounts(
  tenantId: string,
): Promise<{ id: string; name: string }[]> {
  const t = await metaToken(tenantId);
  if (!t) return [];
  const res = await fetch(
    `${GRAPH()}/me/adaccounts?fields=account_id,name&limit=200&access_token=${t.token}`,
  );
  if (!res.ok) return [];
  const j = (await res.json()) as { data?: Array<{ account_id: string; name?: string }> };
  return (j.data ?? []).map((a) => ({ id: a.account_id, name: a.name ?? a.account_id }));
}

export interface AdCreative {
  id: string;
  name: string;
  thumbnail: string | null;
  campaign: string | null;
  adset: string | null;
  status: string | null;
}

/**
 * Busca UM anúncio pelo ID (o `utm_content` das URLs de tráfego pago da Meta),
 * com nome, campanha, conjunto e a miniatura do criativo. Retorna null se o
 * tenant não tem Meta conectado ou o ID não é numérico.
 */
export async function getAdCreative(tenantId: string, adId: string): Promise<AdCreative | null> {
  if (!/^\d{5,}$/.test(adId)) return null;
  const t = await metaToken(tenantId);
  if (!t) return null;
  const fields =
    "name,effective_status,adset{name},campaign{name},creative{thumbnail_url,image_url}";
  const res = await fetch(
    `${GRAPH()}/${adId}?fields=${encodeURIComponent(fields)}&access_token=${t.token}`,
  );
  if (!res.ok) return null;
  const a = (await res.json()) as {
    id?: string;
    name?: string;
    effective_status?: string;
    adset?: { name?: string };
    campaign?: { name?: string };
    creative?: { thumbnail_url?: string; image_url?: string };
  };
  if (!a.id) return null;
  return {
    id: a.id,
    name: a.name ?? "Anúncio",
    thumbnail: a.creative?.thumbnail_url ?? a.creative?.image_url ?? null,
    campaign: a.campaign?.name ?? null,
    adset: a.adset?.name ?? null,
    status: a.effective_status ?? null,
  };
}

export interface AdRow {
  adId: string;
  campaign: string;
  adset: string;
  ad: string;
  thumbnail: string | null;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
}

/**
 * Relatório de anúncios (criativos) de uma conta no período: campanha → conjunto
 * → anúncio, com miniatura do criativo e métricas. Puxa ao vivo da Graph API.
 */
export async function getAdsReport(
  tenantId: string,
  accountId: string | null,
  since: string,
  until: string,
): Promise<AdRow[]> {
  const t = await metaToken(tenantId);
  if (!t) return [];
  const acc = (accountId || t.accountRef || "").replace(/^act_/, "");
  if (!acc) return [];

  // 1) Todos os anúncios com miniatura do criativo
  const ads = new Map<string, AdRow>();
  let adsUrl: string | null =
    `${GRAPH()}/act_${acc}/ads?fields=id,name,effective_status,adset{name},campaign{name},` +
    `creative{thumbnail_url}&limit=200&access_token=${t.token}`;
  for (let p = 0; adsUrl && p < 5; p++) {
    const r: Response = await fetch(adsUrl);
    if (!r.ok) break;
    const j = (await r.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        effective_status?: string;
        adset?: { name?: string };
        campaign?: { name?: string };
        creative?: { thumbnail_url?: string };
      }>;
      paging?: { next?: string };
    };
    for (const a of j.data ?? []) {
      ads.set(a.id, {
        adId: a.id,
        campaign: a.campaign?.name ?? "—",
        adset: a.adset?.name ?? "—",
        ad: a.name ?? "—",
        thumbnail: a.creative?.thumbnail_url ?? null,
        status: a.effective_status ?? "",
        spend: 0,
        impressions: 0,
        clicks: 0,
      });
    }
    adsUrl = j.paging?.next ?? null;
  }

  // 2) Insights por anúncio no período → mescla métricas
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  let insUrl: string | null =
    `${GRAPH()}/act_${acc}/insights?level=ad&fields=ad_id,spend,impressions,clicks` +
    `&time_range=${tr}&limit=500&access_token=${t.token}`;
  for (let p = 0; insUrl && p < 10; p++) {
    const r: Response = await fetch(insUrl);
    if (!r.ok) break;
    const j = (await r.json()) as {
      data?: Array<{ ad_id: string; spend?: string; impressions?: string; clicks?: string }>;
      paging?: { next?: string };
    };
    for (const row of j.data ?? []) {
      const a = ads.get(row.ad_id);
      if (a) {
        a.spend += Number(row.spend ?? 0);
        a.impressions += Number(row.impressions ?? 0);
        a.clicks += Number(row.clicks ?? 0);
      }
    }
    insUrl = j.paging?.next ?? null;
  }

  return [...ads.values()].sort(
    (x, y) => x.campaign.localeCompare(y.campaign) || x.adset.localeCompare(y.adset),
  );
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
