import { createLogger } from "@trk/shared";
import { supabase } from "../supabase.js";
import { decryptSecret } from "../crypto.js";
import { env } from "../supabase.js";
import { buildMetaCapiPayload, sendMetaCapi } from "../senders/meta.js";
import { buildGoogleOfflinePayload, sendGoogleOffline } from "../senders/google.js";
import { computeMatchQuality, toGoogleDateTime } from "../senders/retry.js";

const log = createLogger({ mod: "ingest/dispatch" });

type Target = "meta_capi" | "google_offline";

/** Reserva o envio p/ um target. Não reenvia o que já foi 'sent' (idempotência FR-014). */
async function claim(tenantId: string, eventId: string, target: Target, matchQuality: string): Promise<boolean> {
  const db = supabase();
  const { data } = await db
    .from("conversion_dispatch")
    .select("status")
    .eq("event_id", eventId)
    .eq("target", target)
    .maybeSingle();
  if (data?.status === "sent") return false;
  if (!data) {
    await db.from("conversion_dispatch").insert({
      tenant_id: tenantId,
      event_id: eventId,
      target,
      status: "pending",
      match_quality: matchQuality,
    });
  }
  return true;
}

async function finish(eventId: string, target: Target, status: "sent" | "failed", response: unknown): Promise<void> {
  const db = supabase();
  const { data } = await db
    .from("conversion_dispatch")
    .select("attempts")
    .eq("event_id", eventId)
    .eq("target", target)
    .maybeSingle();
  await db
    .from("conversion_dispatch")
    .update({ status, response: response as object, attempts: (data?.attempts ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("target", target);
}

/**
 * Envia a conversão atribuída de um evento para Meta (CAPI) e/ou Google (Offline),
 * repassando fbclid/gclid do clique original (FR-018). Idempotente por target.
 */
export async function dispatchConversion(eventId: string): Promise<void> {
  const db = supabase();
  const { data: ev } = await db
    .from("event")
    .select("id, tenant_id, event_type, lead_id, value, currency, attributed, occurred_at")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev || !ev.attributed || !ev.lead_id) return;

  const { data: clicks } = await db
    .from("click")
    .select("fbclid, gclid, clicked_at")
    .eq("lead_id", ev.lead_id)
    .order("clicked_at", { ascending: false });
  const fbRow = clicks?.find((c) => c.fbclid) ?? null;
  const gRow = clicks?.find((c) => c.gclid) ?? null;
  const fbclid = fbRow?.fbclid ?? null;
  const gclid = gRow?.gclid ?? null;

  const { data: lead } = await db.from("lead").select("phone, email").eq("id", ev.lead_id).maybeSingle();
  const eventName = ev.event_type === "PURCHASE" ? "Purchase" : "Lead";

  const { data: integs } = await db
    .from("integration")
    .select("provider, account_ref, access_token_enc, refresh_token_enc, meta")
    .eq("tenant_id", ev.tenant_id)
    .in("provider", ["meta", "google"]);
  const metaInteg = integs?.find((i) => i.provider === "meta");
  const googleInteg = integs?.find((i) => i.provider === "google");

  // --- Meta CAPI
  const pixelId = (metaInteg?.meta as { pixel_id?: string })?.pixel_id;
  if (pixelId && metaInteg?.access_token_enc) {
    if (await claim(ev.tenant_id, eventId, "meta_capi", computeMatchQuality(Boolean(fbclid)))) {
      try {
        const token = await decryptSecret(metaInteg.access_token_enc as string);
        const payload = buildMetaCapiPayload({
          eventName,
          eventTime: Math.floor(new Date(ev.occurred_at).getTime() / 1000),
          phone: lead?.phone,
          email: lead?.email,
          fbclid,
          clickTimeMs: fbRow ? new Date(fbRow.clicked_at).getTime() : null,
          value: ev.value,
          currency: ev.currency,
          testEventCode: env.META_TEST_EVENT_CODE ?? null,
        });
        const r = await sendMetaCapi(pixelId, token, payload);
        await finish(eventId, "meta_capi", r.ok ? "sent" : "failed", r.body);
        if (!r.ok) throw new Error(`meta capi ${r.status}`);
      } catch (err) {
        await finish(eventId, "meta_capi", "failed", { error: String(err) });
        throw err; // deixa o BullMQ reprocessar
      }
    }
  }

  // --- Google Offline Click Conversion (precisa de gclid + conversion_action)
  const convAction = (googleInteg?.meta as { conversion_action?: string })?.conversion_action;
  if (gclid && googleInteg?.account_ref && googleInteg.refresh_token_enc && convAction) {
    if (await claim(ev.tenant_id, eventId, "google_offline", "full")) {
      try {
        const refresh = await decryptSecret(googleInteg.refresh_token_enc as string);
        const payload = buildGoogleOfflinePayload({
          gclid,
          conversionAction: convAction,
          conversionDateTime: toGoogleDateTime(gRow?.clicked_at ?? ev.occurred_at),
          value: ev.value,
          currency: ev.currency,
        });
        const r = await sendGoogleOffline(googleInteg.account_ref as string, refresh, payload);
        await finish(eventId, "google_offline", r.ok ? "sent" : "failed", r.body);
        if (!r.ok) throw new Error(`google offline ${r.status}`);
      } catch (err) {
        await finish(eventId, "google_offline", "failed", { error: String(err) });
        throw err;
      }
    }
  }

  log.info("dispatch processado", { eventId, hasFbclid: Boolean(fbclid), hasGclid: Boolean(gclid) });
}
