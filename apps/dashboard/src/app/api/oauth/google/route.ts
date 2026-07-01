import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { connectGoogle, exchangeCodeGoogle } from "@/server/integrations/google";
import { createLogger } from "@trk/shared";

export const runtime = "nodejs";
const log = createLogger({ route: "oauth/google" });

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return Response.json({ error: "code/state ausentes" }, { status: 400 });

  const bound = (await cookies()).get("google_oauth_tenant")?.value;
  if (!bound || bound !== state) return Response.json({ error: "state_mismatch" }, { status: 400 });

  try {
    const refresh = await exchangeCodeGoogle(code, `${process.env.APP_URL}/api/oauth/google`);
    await connectGoogle(state, refresh);
  } catch (err) {
    log.error("falha ao conectar Google", { err: String(err), tenant: state });
    return Response.redirect(new URL(`/${state}/connections?google=erro`, req.url));
  }
  return Response.redirect(new URL(`/${state}/connections?google=ok`, req.url));
}
