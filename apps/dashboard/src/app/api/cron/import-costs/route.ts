import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { importMetaCosts } from "@/server/integrations/meta";
import { importGoogleCosts } from "@/server/integrations/google";
import { createLogger } from "@trk/shared";

export const runtime = "nodejs";
export const maxDuration = 300;
const log = createLogger({ route: "cron/import-costs" });

/** Importa custos de todos os tenants conectados. Protegida por CRON_SECRET. */
export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || auth !== process.env.CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: integrations } = await supabase
    .from("integration")
    .select("tenant_id, provider")
    .in("provider", ["meta", "google"]);

  let imported = 0;
  const errors: string[] = [];
  for (const { tenant_id, provider } of integrations ?? []) {
    try {
      imported +=
        provider === "meta" ? await importMetaCosts(tenant_id) : await importGoogleCosts(tenant_id);
    } catch (err) {
      errors.push(`${provider}:${tenant_id}`);
      log.error("falha ao importar custos", { provider, tenant_id, err: String(err) });
    }
  }

  return Response.json({ ok: true, imported, errors });
}
