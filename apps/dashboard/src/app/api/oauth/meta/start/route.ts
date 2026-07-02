import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppCredentials } from "@/server/appCredentials";

export const runtime = "nodejs";

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

  const { clientId } = await getAppCredentials(tenant.agency_id, "meta");
  if (!clientId) return Response.redirect(new URL(`/${tenantId}/meta?erro=sem_credenciais`, req.url));

  (await cookies()).set("meta_oauth_tenant", tenantId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const ver = process.env.META_API_VERSION ?? "v21.0";
  const url = new URL(`https://www.facebook.com/${ver}/dialog/oauth`);
  url.searchParams.set("client_id", clientId);
  // redirect_uri derivado da origem real da requisição (evita depender de APP_URL).
  url.searchParams.set("redirect_uri", `${req.nextUrl.origin}/api/oauth/meta`);
  url.searchParams.set("state", tenantId);
  url.searchParams.set("scope", "ads_read,ads_management");
  return Response.redirect(url.toString());
}
