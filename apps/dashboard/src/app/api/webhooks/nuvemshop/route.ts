import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { decryptSecret } from "@/server/crypto";
import { fetchOrder } from "@/server/integrations/nuvemshop";
import { getAppCredentials } from "@/server/appCredentials";
import { enqueueDispatch } from "@/server/worker";
import { extractTrackingCode, createLogger } from "@trk/shared";

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

    // Dados do comprador (do pedido ou do cadastro do cliente).
    const buyerName = order?.contact_name ?? order?.customer?.name ?? null;
    const buyerEmail = order?.contact_email ?? order?.customer?.email ?? null;
    const buyerPhone = order?.contact_phone ?? order?.customer?.phone ?? null;
    const customerId = order?.customer?.id != null ? String(order.customer.id) : null;

    // Atribuição em cascata: TRK na nota → ID do cliente (external_id) → email.
    // Assim a venda liga ao lead mesmo sem o TRK no pedido, desde que o
    // comprador tenha se identificado (login) ou usado o mesmo e-mail.
    let leadId: string | null = null;
    let attributed = false;

    const findLead = async (column: string, val: string) => {
      const { data } = await supabase
        .from("lead")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq(column, val)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.id as string | undefined) ?? null;
    };

    if (trk) leadId = await findLead("tracking_code", trk);
    if (!leadId && customerId) leadId = await findLead("external_id", customerId);
    if (!leadId && buyerEmail) leadId = await findLead("email", buyerEmail);
    attributed = Boolean(leadId);

    // Preenche o comprador no lead (só campos vazios; não sobrescreve).
    if (leadId) {
      const fill: Record<string, string> = {};
      if (buyerName) fill.name = buyerName;
      if (buyerEmail) fill.email = buyerEmail;
      if (buyerPhone) fill.phone = buyerPhone;
      if (customerId) fill.external_id = customerId;
      for (const [col, v] of Object.entries(fill)) {
        await supabase.from("lead").update({ [col]: v }).eq("id", leadId).is(col, null);
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
