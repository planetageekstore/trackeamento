import { createHash } from "node:crypto";

const metaApiVersion = (): string => process.env.META_API_VERSION ?? "v21.0";

export function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export interface MetaCapiInput {
  eventName: "Purchase" | "Lead";
  eventTime: number; // unix seconds
  phone?: string | null;
  email?: string | null;
  fbclid?: string | null;
  clickTimeMs?: number | null;
  value?: number | null;
  currency?: string;
  testEventCode?: string | null;
}

/** Monta o payload da Conversions API da Meta (puro, testável). */
export function buildMetaCapiPayload(input: MetaCapiInput) {
  const userData: Record<string, unknown> = {};
  if (input.phone) userData.ph = [sha256(input.phone.replace(/\D/g, ""))];
  if (input.email) userData.em = [sha256(input.email)];
  // fbc a partir do fbclid maximiza o Event Match Quality (SC-004).
  if (input.fbclid) {
    const ts = input.clickTimeMs ?? Date.now();
    userData.fbc = `fb.1.${ts}.${input.fbclid}`;
  }

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: input.eventName,
        event_time: input.eventTime,
        action_source: "website",
        user_data: userData,
        custom_data: { value: input.value ?? undefined, currency: input.currency ?? "BRL" },
      },
    ],
  };
  if (input.testEventCode) payload.test_event_code = input.testEventCode;
  return payload;
}

/** Envia o evento à CAPI. Retorna a resposta bruta da Graph API. */
export async function sendMetaCapi(
  pixelId: string,
  accessToken: string,
  payload: ReturnType<typeof buildMetaCapiPayload>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `https://graph.facebook.com/${metaApiVersion()}/${pixelId}/events?access_token=${accessToken}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}
