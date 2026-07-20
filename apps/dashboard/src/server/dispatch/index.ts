import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { decryptSecret } from "@/server/crypto";
import { uploadGoogleOfflineConversion, googleConversionDateTime } from "@/server/integrations/google";
import { sendMetaCapi } from "./metaCapi";
import { sendGa4 } from "./ga4";
import type { SendContext, SendResult } from "./types";

/**
 * Pipeline de envio de conversões (F1 + F7). Varre eventos de conversão dos
 * últimos 7 dias e despacha para os destinos conectados+habilitados: Meta CAPI,
 * Google Offline e GA4 Measurement Protocol. Idempotente por unique(event_id,
 * target) em conversion_dispatch.
 *
 * Janela de 7 dias porque a Meta CAPI rejeita eventos mais antigos que isso.
 */

const WINDOW_DAYS = 7;
const MAX_ATTEMPTS = 5;

type Target = "meta_capi" | "google_offline" | "ga4_mp";

interface CandidateEvent {
  id: string;
  kind: "purchase" | "lead";
  value: number;
  currency: string;
  occurredAt: string;
  leadId: string | null;
}

interface ProviderState {
  meta?: { pixelId: string; token: string; testCode: string | null };
  google?: { conversionAction: string };
  ga4?: { measurementId: string; apiSecret: string };
}

const db = () => createSupabaseServiceClient();

/** Descobre quais destinos estão conectados e com envio habilitado. */
async function providerState(tenantId: string): Promise<ProviderState> {
  const supabase = db();
  const { data: integs } = await supabase
    .from("integration")
    .select("provider, status, account_ref, access_token_enc, meta")
    .eq("tenant_id", tenantId)
    .in("provider", ["meta", "google", "ga4"]);

  const state: ProviderState = {};
  for (const i of integs ?? []) {
    if (i.status !== "connected") continue;
    const meta = (i.meta ?? {}) as Record<string, unknown>;
    if (!meta.dispatch_enabled) continue;
    if (i.provider === "meta" && meta.pixel_id && i.access_token_enc) {
      state.meta = {
        pixelId: String(meta.pixel_id),
        token: await decryptSecret(i.access_token_enc as string),
        testCode: (meta.test_event_code as string) || null,
      };
    } else if (i.provider === "google" && meta.conversion_action) {
      state.google = { conversionAction: String(meta.conversion_action) };
    } else if (i.provider === "ga4" && meta.measurement_id && meta.api_secret_enc) {
      state.ga4 = {
        measurementId: String(meta.measurement_id),
        apiSecret: await decryptSecret(meta.api_secret_enc as string),
      };
    }
  }
  return state;
}

/** Coleta os eventos candidatos na janela: compras + primeiro lead/mensagem por lead. */
async function candidateEvents(tenantId: string, sinceIso: string): Promise<CandidateEvent[]> {
  const supabase = db();
  const { data: rows } = await supabase
    .from("event")
    .select("id, event_type, value, currency, occurred_at, lead_id")
    .eq("tenant_id", tenantId)
    .in("event_type", ["PURCHASE", "LEAD", "MESSAGE_RECEIVED"])
    .gte("occurred_at", sinceIso)
    .order("occurred_at", { ascending: true });

  const out: CandidateEvent[] = [];
  const leadSeen = new Set<string>(); // só o 1º MESSAGE_RECEIVED/LEAD por lead
  for (const e of rows ?? []) {
    const type = e.event_type as string;
    if (type === "PURCHASE") {
      out.push({
        id: e.id as string,
        kind: "purchase",
        value: Number(e.value ?? 0),
        currency: (e.currency as string) ?? "BRL",
        occurredAt: e.occurred_at as string,
        leadId: (e.lead_id as string) ?? null,
      });
    } else {
      const lid = (e.lead_id as string) ?? "";
      if (!lid || leadSeen.has(lid)) continue;
      leadSeen.add(lid);
      out.push({
        id: e.id as string,
        kind: "lead",
        value: 0,
        currency: (e.currency as string) ?? "BRL",
        occurredAt: e.occurred_at as string,
        leadId: lid,
      });
    }
  }
  return out;
}

/** Enriquece com lead (phone/email/ga_client_id) e melhor clique (fbclid/gclid). */
async function enrich(tenantId: string, leadIds: string[]) {
  const supabase = db();
  const leadById = new Map<string, { phone: string | null; email: string | null; gaClientId: string | null }>();
  const clickByLead = new Map<string, { fbclid: string | null; gclid: string | null; clickedAt: string | null }>();
  if (leadIds.length === 0) return { leadById, clickByLead };

  const { data: leads } = await supabase.from("lead").select("id, phone, email, ga_client_id").in("id", leadIds);
  for (const l of leads ?? [])
    leadById.set(l.id as string, {
      phone: (l.phone as string) ?? null,
      email: (l.email as string) ?? null,
      gaClientId: (l.ga_client_id as string) ?? null,
    });

  const { data: clicks } = await supabase
    .from("click")
    .select("lead_id, fbclid, gclid, clicked_at")
    .in("lead_id", leadIds)
    .order("clicked_at", { ascending: true });
  for (const c of clicks ?? []) {
    const lid = c.lead_id as string;
    const cur = clickByLead.get(lid);
    // Prioriza o clique que tenha fbclid ou gclid.
    if (!cur || (!cur.fbclid && !cur.gclid && (c.fbclid || c.gclid))) {
      clickByLead.set(lid, {
        fbclid: (c.fbclid as string) ?? null,
        gclid: (c.gclid as string) ?? null,
        clickedAt: c.clicked_at as string,
      });
    }
  }
  return { leadById, clickByLead };
}

/** Já existe dispatch para (event, target)? */
async function existingDispatch(eventIds: string[]): Promise<Set<string>> {
  const supabase = db();
  const set = new Set<string>();
  if (eventIds.length === 0) return set;
  const { data } = await supabase.from("conversion_dispatch").select("event_id, target, status, attempts").in("event_id", eventIds);
  for (const d of data ?? []) {
    // Considera "resolvido" quando enviado, pulado, ou falhou o máx. de tentativas.
    const done = d.status === "sent" || d.status === "skipped" || (d.status === "failed" && (d.attempts as number) >= MAX_ATTEMPTS);
    if (done) set.add(`${d.event_id}:${d.target}`);
  }
  return set;
}

async function record(
  tenantId: string,
  eventId: string,
  target: Target,
  res: SendResult,
): Promise<void> {
  const supabase = db();
  const status = res.ok ? "sent" : res.skip ? "skipped" : "failed";
  await supabase.from("conversion_dispatch").upsert(
    {
      tenant_id: tenantId,
      event_id: eventId,
      target,
      status,
      match_quality: res.matchQuality ?? null,
      response: (res.response as object) ?? (res.error ? { error: res.error } : null),
      attempts: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,target" },
  );
}

/** Marca a integração para reconexão (401/190). */
async function markReconnect(tenantId: string, provider: "meta" | "google") {
  await db().from("integration").update({ status: "needs_reconnect" }).eq("tenant_id", tenantId).eq("provider", provider);
}

/** Despacha as conversões pendentes de UM tenant. Retorna quantos foram enviados. */
export async function dispatchTenantConversions(tenantId: string): Promise<number> {
  const state = await providerState(tenantId);
  if (!state.meta && !state.google && !state.ga4) return 0;

  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
  const candidates = await candidateEvents(tenantId, sinceIso);
  if (candidates.length === 0) return 0;

  const leadIds = [...new Set(candidates.map((c) => c.leadId).filter((x): x is string => Boolean(x)))];
  const { leadById, clickByLead } = await enrich(tenantId, leadIds);
  const done = await existingDispatch(candidates.map((c) => c.id));

  let sent = 0;
  for (const c of candidates) {
    const lead = (c.leadId && leadById.get(c.leadId)) || { phone: null, email: null, gaClientId: null };
    const click = (c.leadId && clickByLead.get(c.leadId)) || null;
    const ctx: SendContext = { event: c, lead, click };

    // Meta CAPI
    if (state.meta && !done.has(`${c.id}:meta_capi`)) {
      const res = await sendMetaCapi(state.meta.pixelId, state.meta.token, state.meta.testCode, ctx);
      await record(tenantId, c.id, "meta_capi", res);
      if (res.ok) sent++;
      if (res.needsReconnect) await markReconnect(tenantId, "meta");
    }

    // Google Offline (exige gclid)
    if (state.google && !done.has(`${c.id}:google_offline`)) {
      if (!click?.gclid) {
        await record(tenantId, c.id, "google_offline", { ok: false, skip: true, error: "sem gclid" });
      } else {
        const g = await uploadGoogleOfflineConversion(
          tenantId,
          click.gclid,
          state.google.conversionAction,
          c.value,
          c.currency,
          googleConversionDateTime(c.occurredAt),
        );
        await record(tenantId, c.id, "google_offline", g);
        if (g.ok) sent++;
        if (g.needsReconnect) await markReconnect(tenantId, "google");
      }
    }

    // GA4 Measurement Protocol
    if (state.ga4 && !done.has(`${c.id}:ga4_mp`)) {
      const fallbackClientId = `${(c.leadId ?? c.id).replace(/-/g, "").slice(0, 16)}.${Math.floor(new Date(c.occurredAt).getTime() / 1000)}`;
      const res = await sendGa4(state.ga4.measurementId, state.ga4.apiSecret, ctx, fallbackClientId);
      await record(tenantId, c.id, "ga4_mp", res);
      if (res.ok) sent++;
    }
  }
  return sent;
}
