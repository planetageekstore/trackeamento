import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { decryptSecret } from "@/server/crypto";
import { fetchOrder } from "@/server/integrations/nuvemshop";
import { enqueueDispatch } from "@/server/worker";
import { extractTrackingCode, createLogger } from "@trk/shared";

export const runtime = "nodejs";
const log = createLogger({ route: "webhooks/nuvemshop" });

function validHmac(raw: string, header: string | null): boolean {
  const secret = process.env.NUVEMSHOP_CLIENT_SECRET;
  if (!secret || !header) return false;
  const digest = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Webhook order/paid: extrai o TRK da nota e registra PURCHASE (dedup por order.id). */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  if (!validHmac(raw, req.headers.get("x-linkedstore-hmac-sha256"))) {
    return Response.json({ error: "invalid_hmac" }, { status: 401 });
  }

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

  // Resolve tenant + token pela loja
  const { data: integ } = await supabase
    .from("integration")
    .select("tenant_id, access_token_enc")
    .eq("provider", "nuvemshop")
    .eq("account_ref", String(storeId))
    .maybeSingle();
  if (!integ) return Response.json({ ok: true }, { status: 202 });

  const tenantId = integ.tenant_id as string;
  const externalId = `order:${orderId}`;

  // Dedup (FR-014)
  const { data: existing } = await supabase
    .from("event")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("source", "nuvemshop")
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing) return Response.json({ ok: true, deduped: true }, { status: 202 });

  try {
    const token = await decryptSecret(integ.access_token_enc as string);
    const order = await fetchOrder(storeId, token, orderId);
    const note = order?.note ?? "";
    const trk = extractTrackingCode(note);
    const value = order?.total ? Number(order.total) : null;

    let leadId: string | null = null;
    let attributed = false;
    if (trk) {
      const { data: lead } = await supabase
        .from("lead")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("tracking_code", trk)
        .maybeSingle();
      if (lead) {
        leadId = lead.id as string;
        attributed = true;
        if (order?.contact_email) {
          await supabase.from("lead").update({ email: order.contact_email }).eq("id", leadId).is("email", null);
        }
      }
    }

    const { data: inserted } = await supabase
      .from("event")
      .insert({
        tenant_id: tenantId,
        lead_id: leadId,
        event_type: "PURCHASE",
        source: "nuvemshop",
        external_id: externalId,
        value,
        currency: order?.currency ?? "BRL",
        event_data: { order_id: orderId, attributed },
        attributed,
        occurred_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    // Conversão paga e atribuída → envia server-side (Purchase) via worker (US5).
    if (attributed && inserted) await enqueueDispatch(inserted.id as string);
  } catch (err) {
    log.error("falha ao processar order/paid", { err: String(err), tenantId });
  }

  return Response.json({ ok: true }, { status: 202 });
}
