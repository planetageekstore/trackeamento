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

const AD_FIELDS = "name,effective_status,adset{name},campaign{name},creative{thumbnail_url,image_url}";

interface RawAd {
  id?: string;
  name?: string;
  effective_status?: string;
  adset?: { name?: string };
  campaign?: { name?: string };
  creative?: { thumbnail_url?: string; image_url?: string };
}

function mapAd(a: RawAd): AdCreative | null {
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

async function fetchAd(token: string, adId: string): Promise<AdCreative | null> {
  try {
    const res = await fetch(`${GRAPH()}/${adId}?fields=${encodeURIComponent(AD_FIELDS)}&access_token=${token}`);
    if (!res.ok) return null;
    return mapAd((await res.json()) as RawAd);
  } catch {
    return null;
  }
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
  return fetchAd(t.token, adId);
}

/** Busca vários anúncios de uma vez (para a lista de leads). Retorna mapa id→criativo. */
export async function getAdCreatives(
  tenantId: string,
  adIds: string[],
): Promise<Record<string, AdCreative>> {
  const ids = [...new Set(adIds.filter((id) => /^\d{5,}$/.test(id)))].slice(0, 60);
  if (ids.length === 0) return {};
  const t = await metaToken(tenantId);
  if (!t) return {};
  const out: Record<string, AdCreative> = {};
  const results = await Promise.all(ids.map((id) => fetchAd(t.token, id)));
  ids.forEach((id, i) => {
    const r = results[i];
    if (r) out[id] = r;
  });
  return out;
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
  reach: number;
  frequency: number;
  ctr: number;
  cpc: number;
  cpm: number;
  results: number;
  revenue: number;
  roas: number;
}

/**
 * Relatório de anúncios (criativos) de uma conta no período: campanha → conjunto
 * → anúncio, com miniatura do criativo e métricas completas. Puxa ao vivo da
 * Graph API (metadados dos anúncios + insights por anúncio).
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
        reach: 0,
        frequency: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        results: 0,
        revenue: 0,
        roas: 0,
      });
    }
    adsUrl = j.paging?.next ?? null;
  }

  // 2) Insights por anúncio no período → mescla métricas
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  let insUrl: string | null =
    `${GRAPH()}/act_${acc}/insights?level=ad&fields=ad_id,spend,impressions,clicks,reach,frequency,` +
    `ctr,cpc,cpm,actions,action_values,purchase_roas&time_range=${tr}&limit=500&access_token=${t.token}`;
  for (let p = 0; insUrl && p < 10; p++) {
    const r: Response = await fetch(insUrl);
    if (!r.ok) break;
    const j = (await r.json()) as { data?: Array<Record<string, unknown>>; paging?: { next?: string } };
    for (const row of j.data ?? []) {
      const a = ads.get(row.ad_id as string);
      if (!a) continue;
      a.spend += Number(row.spend ?? 0);
      a.impressions += Number(row.impressions ?? 0);
      a.clicks += Number(row.clicks ?? 0);
      a.reach += Number(row.reach ?? 0);
      a.frequency = Number(row.frequency ?? a.frequency);
      a.ctr = Number(row.ctr ?? a.ctr);
      a.cpc = Number(row.cpc ?? a.cpc);
      a.cpm = Number(row.cpm ?? a.cpm);
      a.results += sumActions(row.actions as MetaAction[] | undefined, RESULT_TYPES);
      a.revenue += sumActions(row.action_values as MetaAction[] | undefined, ["purchase"]);
      const roasArr = row.purchase_roas as MetaAction[] | undefined;
      if (roasArr?.[0]?.value) a.roas = Number(roasArr[0]!.value);
    }
    insUrl = j.paging?.next ?? null;
  }
  for (const a of ads.values()) if (a.roas === 0 && a.spend > 0) a.roas = a.revenue / a.spend;

  return [...ads.values()].sort(
    (x, y) => x.campaign.localeCompare(y.campaign) || x.adset.localeCompare(y.adset),
  );
}

/**
 * Métricas por CONJUNTO de anúncios (adset) no período, com campanha pai e
 * status. Mesmo padrão do getCampaignsInsights (metadados + insights).
 */
export async function getAdsetsInsights(
  tenantId: string,
  accountId: string | null,
  since: string,
  until: string,
): Promise<CampaignMetrics[]> {
  const t = await metaToken(tenantId);
  if (!t) return [];
  const acc = (accountId || t.accountRef || "").replace(/^act_/, "");
  if (!acc) return [];

  // Metadados (status + nome da campanha pai) por conjunto.
  const meta = new Map<string, { status?: string; name?: string; campaign?: string }>();
  let metaUrl: string | null =
    `${GRAPH()}/act_${acc}/adsets?fields=id,name,effective_status,campaign{name}&limit=300&access_token=${t.token}`;
  for (let p = 0; metaUrl && p < 5; p++) {
    const r: Response = await fetch(metaUrl);
    if (!r.ok) break;
    const j = (await r.json()) as {
      data?: Array<{ id: string; name?: string; effective_status?: string; campaign?: { name?: string } }>;
      paging?: { next?: string };
    };
    for (const a of j.data ?? [])
      meta.set(a.id, { status: a.effective_status, name: a.name, campaign: a.campaign?.name });
    metaUrl = j.paging?.next ?? null;
  }

  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  const res = await fetch(
    `${GRAPH()}/act_${acc}/insights?level=adset&fields=adset_id,adset_name,campaign_name,spend,impressions,` +
      `clicks,reach,ctr,cpc,cpm,frequency,inline_link_clicks,actions,action_values,purchase_roas` +
      `&time_range=${tr}&limit=500&access_token=${t.token}`,
  );
  if (!res.ok) return [];
  const j = (await res.json()) as { data?: Array<Record<string, unknown>> };
  return (j.data ?? []).map((r) => {
    const id = r.adset_id as string;
    const m = meta.get(id) ?? {};
    const spend = Number(r.spend ?? 0);
    const revenue = sumActions(r.action_values as MetaAction[] | undefined, ["purchase"]);
    const roasArr = r.purchase_roas as MetaAction[] | undefined;
    const roas = roasArr?.[0]?.value ? Number(roasArr[0]!.value) : spend > 0 ? revenue / spend : 0;
    return {
      id,
      name: (r.adset_name as string) ?? m.name ?? id,
      objective: m.campaign ?? null, // reaproveita o campo p/ mostrar a campanha pai
      status: m.status ?? null,
      spend,
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      reach: Number(r.reach ?? 0),
      ctr: Number(r.ctr ?? 0),
      cpc: Number(r.cpc ?? 0),
      cpm: Number(r.cpm ?? 0),
      frequency: Number(r.frequency ?? 0),
      linkClicks: Number(r.inline_link_clicks ?? 0),
      results: sumActions(r.actions as MetaAction[] | undefined, RESULT_TYPES),
      revenue,
      roas,
    };
  });
}

/**
 * Pausa ou reativa um objeto de anúncio (campanha, conjunto ou anúncio) na Meta.
 * Ação de ESCRITA — requer token com escopo `ads_management`. Retorna erro claro
 * se o token for somente leitura.
 */
export async function setAdObjectStatus(
  tenantId: string,
  objectId: string,
  status: "ACTIVE" | "PAUSED",
): Promise<{ ok: boolean; error?: string }> {
  const t = await metaToken(tenantId);
  if (!t) return { ok: false, error: "Meta não conectado." };
  if (!/^\d{5,}$/.test(objectId)) return { ok: false, error: "ID inválido." };
  const res = await fetch(`${GRAPH()}/${objectId}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ status, access_token: t.token }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
    const msg = j.error?.message ?? `HTTP ${res.status}`;
    // 200/10/294 ~ permissão insuficiente (token somente leitura).
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export interface CampaignMetrics {
  id: string;
  name: string;
  objective: string | null;
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number; // %
  cpc: number; // custo por clique (moeda da conta)
  cpm: number; // custo por mil impressões
  frequency: number;
  linkClicks: number;
  results: number; // leads + compras (conversões)
  revenue: number; // valor das compras
  roas: number; // retorno sobre o gasto (revenue/spend)
}

type MetaAction = { action_type: string; value: string };
const sumActions = (arr: MetaAction[] | undefined, types: string[]): number =>
  (arr ?? []).filter((a) => types.some((t) => a.action_type.includes(t))).reduce((s, a) => s + Number(a.value), 0);
const RESULT_TYPES = ["purchase", "lead", "onsite_conversion.lead_grouped"];

/**
 * Métricas por campanha no período: gasto, impressões, cliques, alcance, CTR,
 * CPC, CPM + objetivo/status. Puxa insights + metadados da campanha ao vivo.
 */
export async function getCampaignsInsights(
  tenantId: string,
  accountId: string | null,
  since: string,
  until: string,
): Promise<CampaignMetrics[]> {
  const t = await metaToken(tenantId);
  if (!t) return [];
  const acc = (accountId || t.accountRef || "").replace(/^act_/, "");
  if (!acc) return [];

  // Metadados (objetivo/status) por campanha.
  const meta = new Map<string, { objective?: string; status?: string; name?: string }>();
  const cr = await fetch(
    `${GRAPH()}/act_${acc}/campaigns?fields=id,name,objective,effective_status&limit=200&access_token=${t.token}`,
  );
  if (cr.ok) {
    const j = (await cr.json()) as {
      data?: Array<{ id: string; name?: string; objective?: string; effective_status?: string }>;
    };
    for (const c of j.data ?? [])
      meta.set(c.id, { objective: c.objective, status: c.effective_status, name: c.name });
  }

  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  const res = await fetch(
    `${GRAPH()}/act_${acc}/insights?level=campaign&fields=campaign_id,campaign_name,spend,impressions,` +
      `clicks,reach,ctr,cpc,cpm,frequency,inline_link_clicks,actions,action_values,purchase_roas` +
      `&time_range=${tr}&limit=200&access_token=${t.token}`,
  );
  if (!res.ok) return [];
  const j = (await res.json()) as { data?: Array<Record<string, unknown>> };
  return (j.data ?? []).map((r) => {
    const m = meta.get(r.campaign_id as string) ?? {};
    const spend = Number(r.spend ?? 0);
    const actions = r.actions as MetaAction[] | undefined;
    const revenue = sumActions(r.action_values as MetaAction[] | undefined, ["purchase"]);
    const roasArr = r.purchase_roas as MetaAction[] | undefined;
    const roas = roasArr?.[0]?.value ? Number(roasArr[0]!.value) : spend > 0 ? revenue / spend : 0;
    return {
      id: r.campaign_id as string,
      name: (r.campaign_name as string) ?? m.name ?? (r.campaign_id as string),
      objective: m.objective ?? null,
      status: m.status ?? null,
      spend,
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      reach: Number(r.reach ?? 0),
      ctr: Number(r.ctr ?? 0),
      cpc: Number(r.cpc ?? 0),
      cpm: Number(r.cpm ?? 0),
      frequency: Number(r.frequency ?? 0),
      linkClicks: Number(r.inline_link_clicks ?? 0),
      results: sumActions(actions, RESULT_TYPES),
      revenue,
      roas,
    };
  });
}

export interface BreakdownRow {
  key: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
}

/** Quebra genérica de insights por uma dimensão (posicionamento, região, device, hora). */
export async function getBreakdown(
  tenantId: string,
  accountId: string | null,
  since: string,
  until: string,
  breakdown: string,
  keyFieldParam?: string,
): Promise<BreakdownRow[]> {
  const t = await metaToken(tenantId);
  if (!t) return [];
  const acc = (accountId || t.accountRef || "").replace(/^act_/, "");
  if (!acc) return [];
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  const res = await fetch(
    `${GRAPH()}/act_${acc}/insights?level=account&breakdowns=${breakdown}` +
      `&fields=spend,impressions,clicks,reach&time_range=${tr}&limit=300&access_token=${t.token}`,
  );
  if (!res.ok) return [];
  const j = (await res.json()) as { data?: Array<Record<string, string>> };
  const keyField = keyFieldParam ?? breakdown.split(",")[0]!;
  const agg = new Map<string, BreakdownRow>();
  for (const r of j.data ?? []) {
    const key = String(r[keyField] ?? "—");
    const cur = agg.get(key) ?? { key, spend: 0, impressions: 0, clicks: 0, reach: 0 };
    cur.spend += Number(r.spend ?? 0);
    cur.impressions += Number(r.impressions ?? 0);
    cur.clicks += Number(r.clicks ?? 0);
    cur.reach += Number(r.reach ?? 0);
    agg.set(key, cur);
  }
  return [...agg.values()].sort((a, b) => b.spend - a.spend);
}

export interface DailyPoint {
  date: string;
  campaign: string;
  spend: number;
  clicks: number;
  impressions: number;
}

/** Gasto/cliques/impressões por DIA e por campanha (para gráficos de evolução). */
export async function getDailyInsights(
  tenantId: string,
  accountId: string | null,
  since: string,
  until: string,
): Promise<DailyPoint[]> {
  const t = await metaToken(tenantId);
  if (!t) return [];
  const acc = (accountId || t.accountRef || "").replace(/^act_/, "");
  if (!acc) return [];
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  const out: DailyPoint[] = [];
  let url: string | null =
    `${GRAPH()}/act_${acc}/insights?level=campaign&fields=campaign_name,spend,clicks,impressions` +
    `&time_increment=1&time_range=${tr}&limit=500&access_token=${t.token}`;
  for (let p = 0; url && p < 10; p++) {
    const r: Response = await fetch(url);
    if (!r.ok) break;
    const j = (await r.json()) as {
      data?: Array<Record<string, string>>;
      paging?: { next?: string };
    };
    for (const row of j.data ?? []) {
      out.push({
        date: row.date_start ?? "",
        campaign: row.campaign_name ?? "—",
        spend: Number(row.spend ?? 0),
        clicks: Number(row.clicks ?? 0),
        impressions: Number(row.impressions ?? 0),
      });
    }
    url = j.paging?.next ?? null;
  }
  return out;
}

export interface DemoRow {
  age: string;
  gender: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
}

/** Quebra por IDADE × GÊNERO no período (demografia p/ tráfego pago). */
export async function getDemographics(
  tenantId: string,
  accountId: string | null,
  since: string,
  until: string,
): Promise<DemoRow[]> {
  const t = await metaToken(tenantId);
  if (!t) return [];
  const acc = (accountId || t.accountRef || "").replace(/^act_/, "");
  if (!acc) return [];
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  const res = await fetch(
    `${GRAPH()}/act_${acc}/insights?level=account&breakdowns=age,gender` +
      `&fields=spend,impressions,clicks,reach&time_range=${tr}&limit=200&access_token=${t.token}`,
  );
  if (!res.ok) return [];
  const j = (await res.json()) as { data?: Array<Record<string, string>> };
  return (j.data ?? []).map((r) => ({
    age: r.age ?? "—",
    gender: r.gender ?? "—",
    spend: Number(r.spend ?? 0),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    reach: Number(r.reach ?? 0),
  }));
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
