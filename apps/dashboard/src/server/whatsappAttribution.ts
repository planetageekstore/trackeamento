import "server-only";
import { extractTrackingCode, normalizePhoneE164, createLogger } from "@trk/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const log = createLogger({ mod: "whatsappAttribution" });

const DEFAULT_KEYWORDS = [
  "obrigado pela compra",
  "obrigado pelo pedido",
  "comprei",
  "acabei de comprar",
  "fiz o pedido",
  "paguei",
  "efetuei o pagamento",
  "pagamento realizado",
];

async function purchaseKeywords(tenantId: string): Promise<string[]> {
  const { data } = await createSupabaseServiceClient()
    .from("tenant")
    .select("attribution_config")
    .eq("id", tenantId)
    .maybeSingle();
  const cfg = (data?.attribution_config as { whatsapp_keywords?: string[] } | null) ?? null;
  const list = cfg?.whatsapp_keywords;
  return Array.isArray(list) && list.length > 0 ? list : DEFAULT_KEYWORDS;
}

/**
 * Processa uma mensagem de entrada do WhatsApp (via Uazapi):
 *  - extrai `[Ref: TRK-XXXX]` → vincula ao lead (MESSAGE_RECEIVED atribuído);
 *  - se o telefone já tem lead, associa;
 *  - se o texto casar palavra-chave de compra → registra PURCHASE (o número comprou).
 * Idempotente por message id.
 */
export async function processWhatsappMessage(
  tenantId: string,
  input: { text: string; rawPhone: string; externalId: string },
): Promise<void> {
  const db = createSupabaseServiceClient();
  const phone = normalizePhoneE164(input.rawPhone);

  const { data: existing } = await db
    .from("event")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("source", "whatsapp")
    .eq("external_id", input.externalId)
    .maybeSingle();
  if (existing) return;

  const trk = extractTrackingCode(input.text);
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
  // Sem TRK: tenta achar o lead pelo telefone (já vinculado antes).
  if (!leadId && phone) {
    const { data: lead } = await db
      .from("lead")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("phone", phone)
      .maybeSingle();
    if (lead) leadId = lead.id as string;
  }

  await db.from("event").insert({
    tenant_id: tenantId,
    lead_id: leadId,
    event_type: "MESSAGE_RECEIVED",
    source: "whatsapp",
    external_id: input.externalId,
    event_data: { phone, text: input.text, attributed },
    attributed,
    occurred_at: new Date().toISOString(),
  });

  // Palavra-chave de compra → registra PURCHASE para o lead desse número.
  const keywords = await purchaseKeywords(tenantId);
  const low = input.text.toLowerCase();
  const matched = keywords.find((k) => low.includes(k.toLowerCase()));
  if (matched && leadId) {
    await db
      .from("event")
      .insert({
        tenant_id: tenantId,
        lead_id: leadId,
        event_type: "PURCHASE",
        source: "whatsapp",
        external_id: `kw:${input.externalId}`,
        event_data: { phone, keyword: matched, text: input.text },
        attributed: true,
        occurred_at: new Date().toISOString(),
      })
      .then(() => log.info("compra por palavra-chave", { tenantId, keyword: matched }))
      .then(undefined, () => {});
  }
}
