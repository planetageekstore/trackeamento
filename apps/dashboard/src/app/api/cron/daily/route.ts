import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { qualifyPendingLeads } from "@/server/leadQualification";
import { dispatchTenantConversions } from "@/server/dispatch";
import { createLogger } from "@trk/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const log = createLogger({ route: "cron/daily" });

/**
 * Cron diário consolidado (compatível com o plano Hobby da Vercel — 1x/dia).
 * Roda a qualificação de leads (F8) e o envio de conversões (F1/F7) em sequência.
 * Protegido por CRON_SECRET. Os endpoints separados (qualify-leads,
 * dispatch-conversions) seguem disponíveis para acionamento manual/externo.
 */
async function run(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || auth !== process.env.CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();

  // 1) Qualificação de leads dos tenants com WhatsApp conectado.
  let qualified = 0;
  const qualErrors: string[] = [];
  const { data: instances } = await supabase.from("whatsapp_instance").select("tenant_id").eq("status", "open");
  for (const { tenant_id } of instances ?? []) {
    try {
      qualified += await qualifyPendingLeads(tenant_id);
    } catch (err) {
      qualErrors.push(tenant_id);
      log.error("falha ao qualificar", { tenant_id, err: String(err) });
    }
  }

  // 2) Envio de conversões dos tenants com algum destino conectado.
  let sent = 0;
  const dispErrors: string[] = [];
  const { data: integs } = await supabase
    .from("integration")
    .select("tenant_id")
    .eq("status", "connected")
    .in("provider", ["meta", "google", "ga4"]);
  const tenants = [...new Set((integs ?? []).map((i) => i.tenant_id as string))];
  for (const tenantId of tenants) {
    try {
      sent += await dispatchTenantConversions(tenantId);
    } catch (err) {
      dispErrors.push(tenantId);
      log.error("falha ao despachar", { tenantId, err: String(err) });
    }
  }

  return Response.json({ ok: true, qualified, sent, errors: { qualify: qualErrors, dispatch: dispErrors } });
}

export const GET = run;
export const POST = run;
