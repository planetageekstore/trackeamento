const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ADS_API = "https://googleads.googleapis.com/v17";

export interface GoogleOfflineInput {
  gclid: string;
  conversionAction: string; // resource name: customers/{cid}/conversionActions/{id}
  conversionDateTime: string; // "YYYY-MM-DD HH:MM:SS+00:00"
  value?: number | null;
  currency?: string;
}

/** Monta o payload de Offline Click Conversion (puro, testável). */
export function buildGoogleOfflinePayload(input: GoogleOfflineInput) {
  return {
    conversions: [
      {
        gclid: input.gclid,
        conversionAction: input.conversionAction,
        conversionDateTime: input.conversionDateTime,
        conversionValue: input.value ?? undefined,
        currencyCode: input.currency ?? "BRL",
      },
    ],
    partialFailure: true,
  };
}

async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google refresh => ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Envia a conversão offline via UploadClickConversions. */
export async function sendGoogleOffline(
  customerId: string,
  refreshToken: string,
  payload: ReturnType<typeof buildGoogleOfflinePayload>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const access = await accessTokenFromRefresh(refreshToken);
  const headers: Record<string, string> = {
    authorization: `Bearer ${access}`,
    "developer-token": process.env.GOOGLE_DEVELOPER_TOKEN ?? "",
    "content-type": "application/json",
  };
  if (process.env.GOOGLE_LOGIN_CUSTOMER_ID) headers["login-customer-id"] = process.env.GOOGLE_LOGIN_CUSTOMER_ID;

  const res = await fetch(`${ADS_API}/customers/${customerId}:uploadClickConversions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}
