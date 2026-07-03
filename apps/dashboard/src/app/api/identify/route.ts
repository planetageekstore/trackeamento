import type { NextRequest } from "next/server";
import { createLogger } from "@trk/shared";
import { resolveTenant } from "@/server/tenant";
import { resolveNuvemshopCustomer } from "@/server/integrations/nuvemshop";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { corsFor, jsonResponse, rateLimit } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // rota sempre dinâmica (busta cache de build)
const log = createLogger({ route: "api/identify" });

export function OPTIONS(req: NextRequest): Response {
  return new Response(null, { status: 204, headers: corsFor(req.headers.get("origin")) });
}

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  // ignora placeholders de template não substituídos (ex.: "{{ order.email }}")
  if (!s || s.includes("{{") || s.includes("}}")) return null;
  return s.slice(0, max);
};

/**
 * Associa dados de contato (nome/email/telefone) informados pelo cliente ao
 * lead do TRK atual. Chamado via window._saasTrk.identify(...) — tipicamente
 * na página de confirmação da compra (dados do pedido) ou em formulários.
 * Só grava campos preenchidos; não apaga os já existentes.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const cors = req.headers.get("origin");
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, cors);
  }

  const body = (raw ?? {}) as Record<string, unknown>;
  const sk = typeof body.sk === "string" ? body.sk : "";
  const trk = typeof body.trk === "string" ? body.trk : "";
  if (!sk || !/^TRK-[A-Z0-9]+$/.test(trk)) return jsonResponse({ error: "invalid_payload" }, 400, cors);

  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!rateLimit(`id:${sk}:${ip}`)) return jsonResponse({ error: "rate_limited" }, 429, cors);

  const tenant = await resolveTenant(sk, origin);
  if (!tenant) return jsonResponse({ error: "unauthorized" }, 403, cors);

  const patch: Record<string, string> = {};
  let name = clean(body.name, 120);
  let email = clean(body.email, 200);
  let phone = clean(body.phone, 40);

  // ns_customer: ID do cliente logado (window.LS.customer). Resolve nome/email/
  // telefone pela API do Nuvemshop quando não vieram no payload.
  const nsCustomer =
    body.ns_customer == null ? null : clean(String(body.ns_customer), 40);
  if (nsCustomer && !(name && email && phone)) {
    const c = await resolveNuvemshopCustomer(tenant.id, nsCustomer);
    if (c) {
      name = name ?? c.name;
      email = email ?? c.email;
      phone = phone ?? c.phone;
    }
    patch.external_id = nsCustomer;
  }

  if (name) patch.name = name;
  if (email) patch.email = email;
  if (phone) patch.phone = phone;
  if (Object.keys(patch).length === 0) return jsonResponse({ ok: true }, 202, cors);

  try {
    const supabase = createSupabaseServiceClient();
    await supabase
      .from("lead")
      .update(patch)
      .eq("tenant_id", tenant.id)
      .eq("tracking_code", trk);
  } catch (err) {
    log.error("falha ao identificar lead", { err: String(err), tenant: tenant.id });
  }

  return jsonResponse({ ok: true }, 202, cors);
}
