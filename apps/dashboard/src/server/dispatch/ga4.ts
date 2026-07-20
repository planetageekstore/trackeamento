import "server-only";
import type { SendContext, SendResult } from "./types";

/**
 * Envia uma conversão ao GA4 via Measurement Protocol. Usa o client_id capturado
 * do cookie _ga; leads sem ele (ex.: só WhatsApp) usam um id determinístico
 * derivado do event/lead, para o evento entrar mesmo sem sessão web.
 */
export async function sendGa4(
  measurementId: string,
  apiSecret: string,
  ctx: SendContext,
  fallbackClientId: string,
): Promise<SendResult> {
  const clientId = ctx.lead.gaClientId || fallbackClientId;
  const eventName = ctx.event.kind === "purchase" ? "purchase" : "generate_lead";
  const params: Record<string, unknown> =
    ctx.event.kind === "purchase"
      ? { value: ctx.event.value, currency: ctx.event.currency, transaction_id: ctx.event.id }
      : {};

  const body = {
    client_id: clientId,
    events: [{ name: eventName, params }],
  };

  const url =
    `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}` +
    `&api_secret=${encodeURIComponent(apiSecret)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // O MP retorna 204 sem corpo em sucesso (não valida payload em produção).
  if (res.status !== 204 && !res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  return { ok: true, matchQuality: ctx.lead.gaClientId ? "ga_client_id" : "derived" };
}
