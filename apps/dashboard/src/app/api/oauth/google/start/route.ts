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

  const { clientId } = await getAppCredentials(tenant.agency_id, "google");
  if (!clientId) {
    return Response.redirect(new URL(`/${tenantId}/integracoes?erro=google_sem_credenciais`, req.url));
  }

  (await cookies()).set("google_oauth_tenant", tenantId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${req.nextUrl.origin}/api/oauth/google`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/adwords");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", tenantId);
  return Response.redirect(url.toString());
}
