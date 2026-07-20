import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { qualifyPendingLeads } from "@/server/leadQualification";
import { createLogger } from "@trk/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const log = createLogger({ route: "cron/qualify-leads" });

/**
 * Qualifica por IA os leads com mensagem de WhatsApp nova, em todos os tenants
 * com WhatsApp conectado. Protegida por CRON_SECRET.
 */
async function run(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || auth !== process.env.CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: instances } = await supabase
    .from("whatsapp_instance")
    .select("tenant_id")
    .eq("status", "open");

  let qualified = 0;
  const errors: string[] = [];
  for (const { tenant_id } of instances ?? []) {
    try {
      qualified += await qualifyPendingLeads(tenant_id);
    } catch (err) {
      errors.push(tenant_id);
      log.error("falha ao qualificar leads", { tenant_id, err: String(err) });
    }
  }

  return Response.json({ ok: true, qualified, errors });
}

export const GET = run;
export const POST = run;
