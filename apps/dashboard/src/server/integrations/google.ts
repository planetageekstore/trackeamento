import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { encryptSecret, decryptSecret } from "@/server/crypto";
import { getAppCredentials } from "@/server/appCredentials";
import type { CampaignCostRow } from "./meta";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ADS_API = "https://googleads.googleapis.com/v17";

/** Credenciais do app Google (client id/secret) da agência do tenant. */
export async function getGoogleCreds(
  tenantId: string,
): Promise<{ clientId: string; clientSecret: string } | null> {
  const { data: t } = await createSupabaseServiceClient()
    .from("tenant")
    .select("agency_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!t) return null;
  const { clientId, clientSecret } = await getAppCredentials(t.agency_id, "google");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export interface GoogleAdsRow {
  campaign?: { id?: string; name?: string };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string };
  segments?: { date?: string };
}

/** Transforma linhas do Google Ads em campaign_cost (pura, testável). cost = micros/1e6. */
export function mapGoogleRowsToCosts(rows: GoogleAdsRow[], tenantId: string): CampaignCostRow[] {
  return rows
    .filter((r) => r.campaign?.id && r.segments?.date)
    .map((r) => ({
      tenant_id: tenantId,
      provider: "google",
      campaign_id: r.campaign!.id!,
      campaign_name: r.campaign!.name ?? null,
      date: r.segments!.date!,
      spend: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      raw: r as Record<string, unknown>,
    }));
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google refresh => ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Troca o code por refresh_token (offline). */
export async function exchangeCodeGoogle(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token => ${res.status}`);
  const { refresh_token } = (await res.json()) as { refresh_token?: string };
  if (!refresh_token) throw new Error("Google não retornou refresh_token (use prompt=consent&access_type=offline)");
  return refresh_token;
}

function adsHeaders(accessToken: string): Record<string, string> {
  const h: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    "developer-token": process.env.GOOGLE_DEVELOPER_TOKEN ?? "",
    "content-type": "application/json",
  };
  if (process.env.GOOGLE_LOGIN_CUSTOMER_ID) h["login-customer-id"] = process.env.GOOGLE_LOGIN_CUSTOMER_ID;
  return h;
}

/** Descobre o primeiro customer acessível (account_ref). */
export async function discoverGoogleCustomer(accessToken: string): Promise<string | null> {
  const res = await fetch(`${ADS_API}/customers:listAccessibleCustomers`, { headers: adsHeaders(accessToken) });
  if (!res.ok) return null;
  const { resourceNames } = (await res.json()) as { resourceNames?: string[] };
  return resourceNames?.[0]?.split("/")[1] ?? null;
}

/** Persiste a conexão Google (refresh token cifrado + customer). */
export async function connectGoogle(tenantId: string, refreshToken: string): Promise<void> {
  const creds = await getGoogleCreds(tenantId);
  if (!creds) throw new Error("Credenciais Google não configuradas");
  const access = await refreshAccessToken(refreshToken, creds.clientId, creds.clientSecret);
  const customerId = await discoverGoogleCustomer(access);
  const supabase = createSupabaseServiceClient();
  await supabase.from("integration").upsert(
    {
      tenant_id: tenantId,
      provider: "google",
      status: "connected",
      account_ref: customerId,
      refresh_token_enc: await encryptSecret(refreshToken),
      meta: { login_customer_id: process.env.GOOGLE_LOGIN_CUSTOMER_ID ?? null },
    },
    { onConflict: "tenant_id,provider" },
  );
}

const GAQL =
  "SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, segments.date " +
  "FROM campaign WHERE segments.date DURING LAST_7_DAYS";

/** Importa custos via GAQL (searchStream) e faz upsert em campaign_cost. */
export async function importGoogleCosts(tenantId: string): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const { data: integ } = await supabase
    .from("integration")
    .select("refresh_token_enc, account_ref")
    .eq("tenant_id", tenantId)
    .eq("provider", "google")
    .maybeSingle();
  if (!integ?.account_ref || !integ.refresh_token_enc) return 0;
  const creds = await getGoogleCreds(tenantId);
  if (!creds) return 0;

  const refreshToken = await decryptSecret(integ.refresh_token_enc as string);
  const access = await refreshAccessToken(refreshToken, creds.clientId, creds.clientSecret);

  const res = await fetch(`${ADS_API}/customers/${integ.account_ref}/googleAds:searchStream`, {
    method: "POST",
    headers: adsHeaders(access),
    body: JSON.stringify({ query: GAQL }),
  });
  if (!res.ok) {
    if (res.status === 401) {
      await supabase.from("integration").update({ status: "needs_reconnect" }).eq("tenant_id", tenantId).eq("provider", "google");
    }
    throw new Error(`Google searchStream => ${res.status}`);
  }
  const batches = (await res.json()) as Array<{ results?: GoogleAdsRow[] }>;
  const flat = batches.flatMap((b) => b.results ?? []);
  const rows = mapGoogleRowsToCosts(flat, tenantId);
  if (rows.length > 0) {
    await supabase.from("campaign_cost").upsert(rows, { onConflict: "tenant_id,provider,campaign_id,date" });
  }
  return rows.length;
}
