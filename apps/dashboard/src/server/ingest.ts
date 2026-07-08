import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { hasOrigin, schemas } from "@trk/shared";

type TrackEventInput = ReturnType<typeof schemas.trackEventInputSchema.parse>;

/**
 * Ingestão de eventos de origem (browser). Idempotente no lead
 * (upsert por tenant+trk). Registra um `click` sempre que a URL trouxer origem
 * (UTMs/click ids) — nenhum toque é descartado (FR-023). Insere o `event`.
 *
 * Roda com service role (bypass RLS); o `tenant_id` já foi validado no caller.
 */
export async function ingestEvents(
  tenantId: string,
  trackingCode: string,
  events: TrackEventInput[],
  session?: Record<string, string | null>,
): Promise<void> {
  const supabase = createSupabaseServiceClient();

  // 1) Upsert do lead (FR-001/FR-005). last_seen_at sobe a cada acesso — assim
  // o lead recorrente (mesmo TRK) volta pro topo da lista.
  const { data: lead, error: leadErr } = await supabase
    .from("lead")
    .upsert(
      { tenant_id: tenantId, tracking_code: trackingCode, last_seen_at: new Date().toISOString() },
      { onConflict: "tenant_id,tracking_code" },
    )
    .select("id")
    .single();

  if (leadErr || !lead) throw leadErr ?? new Error("falha ao upsert lead");
  const leadId = lead.id as string;

  // 1b) Enriquecimento first-touch: grava dispositivo/geo só quando ainda vazio
  // (device_type null). Visitas seguintes não sobrescrevem a primeira sessão.
  if (session && Object.values(session).some(Boolean)) {
    await supabase.from("lead").update(session).eq("id", leadId).is("device_type", null);
  }

  for (const ev of events) {
    const utm = {
      source: ev.utm?.source ?? null,
      medium: ev.utm?.medium ?? null,
      campaign: ev.utm?.campaign ?? null,
      content: ev.utm?.content ?? null,
      term: ev.utm?.term ?? null,
    };
    const click = { fbclid: ev.click_ids?.fbclid ?? null, gclid: ev.click_ids?.gclid ?? null };

    // 2) Registra o toque (click) apenas quando há origem real (FR-004/FR-023)
    if (hasOrigin(utm, click)) {
      await supabase.from("click").insert({
        tenant_id: tenantId,
        lead_id: leadId,
        utm_source: utm.source,
        utm_medium: utm.medium,
        utm_campaign: utm.campaign,
        utm_content: utm.content,
        utm_term: utm.term,
        fbclid: click.fbclid,
        gclid: click.gclid,
        referrer: ev.referrer ?? null,
        landing_page_url: ev.url ?? null,
        clicked_at: ev.occurred_at ?? new Date().toISOString(),
      });
    }

    // 3) Evento da jornada (FR-022)
    await supabase.from("event").insert({
      tenant_id: tenantId,
      lead_id: leadId,
      event_type: ev.type,
      source: "tracker",
      event_data: { url: ev.url ?? null, referrer: ev.referrer ?? null, ...(ev.data ?? {}) },
      occurred_at: ev.occurred_at ?? new Date().toISOString(),
    });
  }
}
