import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { connectMeta, exchangeCodeMeta } from "@/server/integrations/meta";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getAppCredentials } from "@/server/appCredentials";
import { createLogger } from "@trk/shared";

export const runtime = "nodejs";
const log = createLogger({ route: "oauth/meta" });

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return Response.json({ error: "code/state ausentes" }, { status: 400 });

  const bound = (await cookies()).get("meta_oauth_tenant")?.value;
  if (!bound || bound !== state) return Response.json({ error: "state_mismatch" }, { status: 400 });

  try {
    const { data: tenant } = await createSupabaseServiceClient()
      .from("tenant")
      .select("agency_id")
      .eq("id", state)
      .maybeSingle();
    const { clientId, clientSecret } = await getAppCredentials(tenant!.agency_id, "meta");
    if (!clientId || !clientSecret) throw new Error("Credenciais Meta não configuradas");

    const token = await exchangeCodeMeta(
      code,
      `${process.env.APP_URL}/api/oauth/meta`,
      clientId,
      clientSecret,
    );
    await connectMeta(state, token);
  } catch (err) {
    log.error("falha ao conectar Meta", { err: String(err), tenant: state });
    return Response.redirect(new URL(`/${state}/connections?meta=erro`, req.url));
  }
  return Response.redirect(new URL(`/${state}/connections?meta=ok`, req.url));
}
