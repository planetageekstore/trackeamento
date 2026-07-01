import { extractTrackingCode, phoneFromRemoteJid, createLogger } from "@trk/shared";
import { supabase } from "./supabase.js";

const log = createLogger({ mod: "attribution" });

/**
 * Processa uma mensagem de entrada do WhatsApp (FR-010/FR-011):
 * extrai `[Ref: TRK-XXXX]` e o telefone, vincula ao lead, registra
 * MESSAGE_RECEIVED (dedup por message.id). Retorna o eventId se foi
 * atribuído (para disparar conversão server-side), senão null.
 */
export async function attributeMessage(
  tenantId: string,
  input: { text: string; remoteJid: string; externalId: string },
): Promise<string | null> {
  const db = supabase();

  // Dedup por message.id (FR-014)
  const { data: existing } = await db
    .from("event")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("source", "whatsapp")
    .eq("external_id", input.externalId)
    .maybeSingle();
  if (existing) return null;

  const trk = extractTrackingCode(input.text);
  const phone = phoneFromRemoteJid(input.remoteJid);

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
      external_id: input.externalId,
      event_data: { phone, text: input.text, attributed },
      attributed,
      occurred_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;

  log.info("mensagem processada", { tenantId, attributed, hasTrk: Boolean(trk) });
  return attributed && inserted ? (inserted.id as string) : null;
}
