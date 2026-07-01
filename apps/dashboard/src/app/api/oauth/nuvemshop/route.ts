import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { connectNuvemshop } from "@/server/integrations/nuvemshop";
import { createLogger } from "@trk/shared";

export const runtime = "nodejs";
const log = createLogger({ route: "oauth/nuvemshop" });

/** Callback do OAuth Nuvemshop: troca o code, conecta a loja e injeta o tracker. */
export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return Response.json({ error: "code/state ausentes" }, { status: 400 });

  // Anti-CSRF: o cookie de vínculo deve casar o state.
  const bound = (await cookies()).get("ns_oauth_tenant")?.value;
  if (!bound || bound !== state) {
    return Response.json({ error: "state_mismatch" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: tenant } = await supabase
    .from("tenant")
    .select("id")
    .eq("id", state)
    .maybeSingle();
  if (!tenant) return Response.json({ error: "tenant_desconhecido" }, { status: 400 });

  try {
    await connectNuvemshop(tenant.id, code);
  } catch (err) {
    log.error("falha ao conectar Nuvemshop", { err: String(err), tenant: tenant.id });
    return Response.redirect(new URL(`/${tenant.id}/conversions?nuvemshop=erro`, req.url));
  }

  return Response.redirect(new URL(`/${tenant.id}/conversions?nuvemshop=ok`, req.url));
}
