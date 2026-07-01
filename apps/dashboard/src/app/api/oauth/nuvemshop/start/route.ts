import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppCredentials } from "@/server/appCredentials";

export const runtime = "nodejs";

/**
 * Inicia o OAuth da Nuvemshop para um tenant. Exige sessão + acesso ao tenant,
 * grava um cookie de vínculo (anti-CSRF) e redireciona para a autorização.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const tenantId = req.nextUrl.searchParams.get("tenant");
  if (!tenantId) return Response.json({ error: "tenant obrigatório" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.redirect(new URL("/login", req.url));

  const { data: tenant } = await supabase
    .from("tenant")
    .select("id, agency_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return Response.json({ error: "forbidden" }, { status: 403 });

  const { clientId } = await getAppCredentials(tenant.agency_id, "nuvemshop");
  if (!clientId) {
    return Response.redirect(new URL(`/${tenantId}?erro=nuvemshop_sem_credenciais`, req.url));
  }

  (await cookies()).set("ns_oauth_tenant", tenantId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const authorize = new URL(`https://www.tiendanube.com/apps/${clientId}/authorize`);
  authorize.searchParams.set("state", tenantId);
  return Response.redirect(authorize.toString());
}
