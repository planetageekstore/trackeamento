import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { decryptSecret } from "@/server/crypto";
import { recordNuvemshopOrderById } from "@/server/integrations/nuvemshop";
import { getAppCredentials } from "@/server/appCredentials";
import { createLogger } from "@trk/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const log = createLogger({ route: "webhooks/nuvemshop" });

function validHmac(raw: string, header: string | null, secret: string | null): boolean {
  if (!secret || !header) return false;
  const digest = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Webhook order/paid: extrai o TRK da nota e registra PURCHASE (dedup por order.id). */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();

  let body: { store_id?: number | string; event?: string; id?: number | string };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const storeId = body.store_id;
  const orderId = body.id;
  if (!storeId || !orderId) return Response.json({ ok: true }, { status: 202 });

  const supabase = createSupabaseServiceClient();

  // Resolve tenant + agência + token pela loja
  const { data: integ } = await supabase
    .from("integration")
    .select("tenant_id, access_token_enc, tenant:tenant_id(agency_id)")
    .eq("provider", "nuvemshop")
    .eq("account_ref", String(storeId))
    .maybeSingle();
  if (!integ) return Response.json({ ok: true }, { status: 202 });

  const tenantId = integ.tenant_id as string;
  const agencyId = (integ.tenant as { agency_id?: string } | null)?.agency_id ?? null;

  // Valida o HMAC com o Client Secret da agência (fallback env).
  const { clientSecret } = agencyId
    ? await getAppCredentials(agencyId, "nuvemshop")
    : { clientSecret: process.env.NUVEMSHOP_CLIENT_SECRET ?? null };
  if (!validHmac(raw, req.headers.get("x-linkedstore-hmac-sha256"), clientSecret)) {
    return Response.json({ error: "invalid_hmac" }, { status: 401 });
  }

  try {
    const token = await decryptSecret(integ.access_token_enc as string);
    await recordNuvemshopOrderById(tenantId, storeId, token, orderId);
  } catch (err) {
    log.error("falha ao processar order/paid", { err: String(err), tenantId });
  }

  return Response.json({ ok: true }, { status: 202 });
}
