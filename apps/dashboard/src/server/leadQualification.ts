import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { anthropicClient } from "@/server/aiBlocks";

/**
 * Qualificação de leads por IA (F8). Lê as mensagens recebidas do lead (WhatsApp,
 * persistidas em event.event_data.text) e classifica temperatura/estágio, se
 * houve compra e se cabe follow-up. Usa structured outputs (JSON garantido).
 */

const MODEL = "claude-opus-4-8";

export type Stage = "novo" | "em_conversa" | "followup" | "negociacao" | "comprou" | "perdido";
export type Temperature = "quente" | "morno" | "frio";

export interface Qualification {
  temperatura: Temperature;
  estagio: Stage;
  houve_compra: boolean;
  evidencia_compra: string;
  followup_recomendado: boolean;
  followup_sugestao: string;
  resumo: string;
  confianca: number;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    temperatura: { type: "string", enum: ["quente", "morno", "frio"] },
    estagio: { type: "string", enum: ["novo", "em_conversa", "followup", "negociacao", "comprou", "perdido"] },
    houve_compra: { type: "boolean" },
    evidencia_compra: { type: "string" },
    followup_recomendado: { type: "boolean" },
    followup_sugestao: { type: "string" },
    resumo: { type: "string" },
    confianca: { type: "number" },
  },
  required: [
    "temperatura",
    "estagio",
    "houve_compra",
    "evidencia_compra",
    "followup_recomendado",
    "followup_sugestao",
    "resumo",
    "confianca",
  ],
} as const;

const SYSTEM = `Você é um analista de vendas. Recebe a transcrição das mensagens que UM lead enviou pelo WhatsApp e classifica o lead. Português do Brasil.

REGRAS:
- Baseie-se SOMENTE na transcrição. Se faltar sinal, seja conservador.
- Só marque houve_compra=true se houver evidência clara (confirmação de pagamento, "comprei", comprovante) — cite o trecho em evidencia_compra.
- estagio: "novo" (mal iniciou), "em_conversa" (interagindo), "followup" (demonstrou interesse mas parou/pediu tempo), "negociacao" (discutindo preço/condições), "comprou" (fechou), "perdido" (desistiu ou sumiu após interesse).
- temperatura: "quente" (interesse forte/recente), "morno" (interesse moderado), "frio" (pouco interesse ou parado).
- confianca: 0 a 1 (quão seguro você está da classificação).
- Só recomende follow-up (followup_recomendado=true) quando fizer sentido reengajar; dê uma sugestão de mensagem curta e natural em followup_sugestao.`;

interface Msg {
  text: string;
  at: string;
}

/** Monta a transcrição das mensagens recebidas do lead a partir dos eventos. */
async function leadTranscript(
  db: ReturnType<typeof createSupabaseServiceClient>,
  tenantId: string,
  leadId: string,
): Promise<Msg[]> {
  const { data } = await db
    .from("event")
    .select("event_data, occurred_at")
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId)
    .eq("event_type", "MESSAGE_RECEIVED")
    .order("occurred_at", { ascending: true })
    .limit(80);
  return (data ?? [])
    .map((e) => ({
      text: String((e.event_data as { text?: string } | null)?.text ?? "").trim(),
      at: e.occurred_at as string,
    }))
    .filter((m) => m.text);
}

function parseQualification(text: string): Qualification | null {
  try {
    const obj = JSON.parse(text) as Qualification;
    if (!obj.temperatura || !obj.estagio) return null;
    return obj;
  } catch {
    return null;
  }
}

/**
 * Qualifica um lead. Retorna a qualificação (ou null se não há conversa).
 * Persiste no histórico + materializa no lead; cria PURCHASE se compra detectada
 * com confiança alta (dedup por external_id).
 */
export async function qualifyLead(tenantId: string, leadId: string): Promise<Qualification | null> {
  const db = createSupabaseServiceClient();
  const messages = await leadTranscript(db, tenantId, leadId);
  if (messages.length === 0) return null;

  const transcript = messages.map((m) => `[${m.at}] ${m.text}`).join("\n");
  const res = await anthropicClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `Transcrição das mensagens do lead:\n\n${transcript}` }],
  });
  const text = res.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
  const q = parseQualification(text);
  if (!q) return null;

  const now = new Date().toISOString();
  await db.from("lead_qualification").insert({
    tenant_id: tenantId,
    lead_id: leadId,
    stage: q.estagio,
    temperature: q.temperatura,
    purchase_detected: q.houve_compra,
    followup: { recomendado: q.followup_recomendado, sugestao: q.followup_sugestao },
    summary: q.resumo,
    confidence: q.confianca,
    model: MODEL,
    analyzed_at: now,
  });

  // Materializa no lead — sem sobrescrever estágio definido manualmente.
  const { data: lead } = await db.from("lead").select("stage, stage_source").eq("id", leadId).maybeSingle();
  const isManual = (lead?.stage_source ?? "ai") === "manual";
  if (!isManual) {
    await db
      .from("lead")
      .update({ stage: q.estagio, temperature: q.temperatura, stage_source: "ai", qualified_at: now })
      .eq("id", leadId);
    // Registra a mudança de estágio no histórico (alimenta o gráfico do CRM).
    if (lead?.stage !== q.estagio) {
      await db.from("lead_stage_history").insert({
        tenant_id: tenantId,
        lead_id: leadId,
        stage: q.estagio,
        source: "ai",
      });
    }
  } else {
    await db.from("lead").update({ temperature: q.temperatura, qualified_at: now }).eq("id", leadId);
  }

  // Compra detectada com confiança alta → registra PURCHASE (dedup natural).
  if (q.houve_compra && q.confianca >= 0.8) {
    const lastAt = messages[messages.length - 1]!.at;
    await db
      .from("event")
      .insert({
        tenant_id: tenantId,
        lead_id: leadId,
        event_type: "PURCHASE",
        source: "whatsapp",
        external_id: `ai:${leadId}:${lastAt}`,
        event_data: { via: "ai_qualification", evidencia: q.evidencia_compra },
        attributed: true,
        occurred_at: lastAt,
      })
      .then(undefined, () => {}); // ignora conflito de dedup
  }

  return q;
}

/**
 * Qualifica leads com mensagem recebida nova desde a última qualificação.
 * Idempotente e barato — só reprocessa quem mudou.
 */
export async function qualifyPendingLeads(tenantId: string, limit = 50): Promise<number> {
  const db = createSupabaseServiceClient();
  // Leads com telefone que têm ao menos uma mensagem recebida.
  const { data: leads } = await db
    .from("lead")
    .select("id, qualified_at")
    .eq("tenant_id", tenantId)
    .not("phone", "is", null)
    .limit(500);
  if (!leads || leads.length === 0) return 0;

  let done = 0;
  for (const lead of leads) {
    if (done >= limit) break;
    const leadId = lead.id as string;
    // Há mensagem nova desde a última qualificação?
    const q = db
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("lead_id", leadId)
      .eq("event_type", "MESSAGE_RECEIVED");
    const { count } = lead.qualified_at
      ? await q.gt("occurred_at", lead.qualified_at as string)
      : await q;
    if ((count ?? 0) === 0) continue;
    try {
      const r = await qualifyLead(tenantId, leadId);
      if (r) done++;
    } catch {
      // segue para o próximo lead
    }
  }
  return done;
}
