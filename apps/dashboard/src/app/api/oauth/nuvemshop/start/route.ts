import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const { data: tenant } = await supabase.from("tenant").select("id").eq("id", tenantId).maybeSingle();
  if (!tenant) return Response.json({ error: "forbidden" }, { status: 403 });

  (await cookies()).set("ns_oauth_tenant", tenantId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const authorize = new URL(
    `https://www.tiendanube.com/apps/${process.env.NUVEMSHOP_CLIENT_ID}/authorize`,
  );
  authorize.searchParams.set("state", tenantId);
  return Response.redirect(authorize.toString());
}
