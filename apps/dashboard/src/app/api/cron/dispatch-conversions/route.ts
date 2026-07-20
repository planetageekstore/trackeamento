import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { dispatchTenantConversions } from "@/server/dispatch";
import { createLogger } from "@trk/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const log = createLogger({ route: "cron/dispatch-conversions" });

/**
 * Envia conversões (Meta CAPI, Google Offline, GA4 MP) de todos os tenants com
 * algum destino conectado. Protegida por CRON_SECRET.
 */
async function run(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || auth !== process.env.CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: integrations } = await supabase
    .from("integration")
    .select("tenant_id")
    .eq("status", "connected")
    .in("provider", ["meta", "google", "ga4"]);
  const tenants = [...new Set((integrations ?? []).map((i) => i.tenant_id as string))];

  let sent = 0;
  const errors: string[] = [];
  for (const tenantId of tenants) {
    try {
      sent += await dispatchTenantConversions(tenantId);
    } catch (err) {
      errors.push(tenantId);
      log.error("falha ao despachar conversões", { tenantId, err: String(err) });
    }
  }

  return Response.json({ ok: true, sent, errors });
}

export const GET = run;
export const POST = run;
