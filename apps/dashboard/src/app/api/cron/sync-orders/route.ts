import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { syncNuvemshopOrders } from "@/server/integrations/nuvemshop";
import { createLogger } from "@trk/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const log = createLogger({ route: "cron/sync-orders" });

/** Sincroniza vendas pagas de todos os tenants Nuvemshop. Protegida por CRON_SECRET. */
async function run(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || auth !== process.env.CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: integrations } = await supabase
    .from("integration")
    .select("tenant_id")
    .eq("provider", "nuvemshop")
    .eq("status", "connected");

  let recorded = 0;
  const errors: string[] = [];
  for (const { tenant_id } of integrations ?? []) {
    try {
      recorded += await syncNuvemshopOrders(tenant_id);
    } catch (err) {
      errors.push(tenant_id);
      log.error("falha ao sincronizar vendas", { tenant_id, err: String(err) });
    }
  }

  return Response.json({ ok: true, recorded, errors });
}

// Vercel Cron dispara via GET; mantemos POST para acionamento manual/externo.
export const GET = run;
export const POST = run;
