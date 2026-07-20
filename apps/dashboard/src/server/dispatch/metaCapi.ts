import "server-only";
import { hashPhone, hashEmail, buildFbc } from "./hash";
import type { SendContext, SendResult } from "./types";

const VER = () => process.env.META_API_VERSION ?? "v21.0";

/**
 * Envia uma conversão para a Meta via Conversions API (CAPI). PII sempre em
 * SHA-256; fbc derivado do fbclid guardado (alta EMQ). Dedup com o pixel do
 * navegador via event_id = event.id.
 */
export async function sendMetaCapi(
  pixelId: string,
  token: string,
  testEventCode: string | null,
  ctx: SendContext,
): Promise<SendResult> {
  const ph = hashPhone(ctx.lead.phone);
  const em = hashEmail(ctx.lead.email);
  const fbc = buildFbc(ctx.click?.fbclid, ctx.click?.clickedAt);

  const userData: Record<string, unknown> = {};
  if (ph) userData.ph = [ph];
  if (em) userData.em = [em];
  if (fbc) userData.fbc = fbc;
  if (Object.keys(userData).length === 0) {
    return { ok: false, skip: true, error: "sem dados de match (telefone/e-mail/fbclid)" };
  }

  const eventName = ctx.event.kind === "purchase" ? "Purchase" : "Lead";
  const body = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(new Date(ctx.event.occurredAt).getTime() / 1000),
        action_source: "website",
        event_id: ctx.event.id,
        user_data: userData,
        custom_data:
          ctx.event.kind === "purchase" ? { value: ctx.event.value, currency: ctx.event.currency } : {},
      },
    ],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };

  const res = await fetch(`https://graph.facebook.com/${VER()}/${pixelId}/events?access_token=${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: number } }).error;
    return {
      ok: false,
      response: json,
      error: err?.message ?? `HTTP ${res.status}`,
      needsReconnect: res.status === 401 || err?.code === 190,
    };
  }
  const matchQuality = [ph && "ph", em && "em", fbc && "fbc"].filter(Boolean).join("+");
  return { ok: true, matchQuality, response: json };
}
