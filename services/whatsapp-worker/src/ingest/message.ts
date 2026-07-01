import { extractTrackingCode, phoneFromRemoteJid, createLogger } from "@trk/shared";
import { supabase } from "../supabase.js";
import { enqueueDispatch, type InboundMessageJob } from "../queue.js";

const log = createLogger({ mod: "ingest/message" });

function extractText(data: InboundMessageJob["message"]): string {
  return data.message?.conversation ?? data.message?.extendedTextMessage?.text ?? "";
}

/**
 * Processa uma mensagem de entrada do WhatsApp (FR-010/FR-011):
 *  - resolve o tenant pela instância;
 *  - extrai `[Ref: TRK-XXXX]` e o telefone (E.164);
 *  - se casar um lead, vincula telefone e registra MESSAGE_RECEIVED atribuído;
 *  - sem marcador/lead → registra não-atribuído (FR-013);
 *  - dedup por (tenant_id, source, external_id=message.id) (FR-014).
 */
export async function processInboundMessage(job: InboundMessageJob): Promise<void> {
  const db = supabase();
  const { instance, message } = job;
  if (message.key.fromMe) return; // apenas mensagens de entrada

  const { data: inst } = await db
    .from("whatsapp_instance")
    .select("tenant_id")
    .eq("instance_name", instance)
    .maybeSingle();
  if (!inst) {
    log.warn("instância sem tenant associado", { instance });
    return;
  }
  const tenantId = inst.tenant_id as string;
  const externalId = message.key.id;

  // Dedup: se já registramos este message.id, sai (idempotência).
  const { data: existing } = await db
    .from("event")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("source", "whatsapp")
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing) return;

  const text = extractText(message);
  const trk = extractTrackingCode(text);
  const phone = phoneFromRemoteJid(message.key.remoteJid);

  let leadId: string | null = null;
  let attributed = false;

  if (trk) {
    const { data: lead } = await db
      .from("lead")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("tracking_code", trk)
      .maybeSingle();
    if (lead) {
      leadId = lead.id as string;
      attributed = true;
      // Enriquecimento: preenche o telefone se ainda estiver vazio.
      await db.from("lead").update({ phone }).eq("id", leadId).is("phone", null);
    }
  }

  const { data: inserted, error } = await db
    .from("event")
    .insert({
      tenant_id: tenantId,
      lead_id: leadId,
      event_type: "MESSAGE_RECEIVED",
      source: "whatsapp",
      external_id: externalId,
      event_data: { phone, text, attributed },
      attributed,
      occurred_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;

  // Conversão atribuída → envia server-side (Lead) para Meta/Google (US5).
  if (attributed && inserted) await enqueueDispatch(inserted.id as string);

  log.info("mensagem processada", { tenantId, attributed, hasTrk: Boolean(trk) });
}
