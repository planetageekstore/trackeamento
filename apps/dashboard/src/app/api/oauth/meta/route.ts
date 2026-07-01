import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { connectMeta, exchangeCodeMeta } from "@/server/integrations/meta";
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
    const token = await exchangeCodeMeta(code, `${process.env.APP_URL}/api/oauth/meta`);
    await connectMeta(state, token);
  } catch (err) {
    log.error("falha ao conectar Meta", { err: String(err), tenant: state });
    return Response.redirect(new URL(`/${state}/connections?meta=erro`, req.url));
  }
  return Response.redirect(new URL(`/${state}/connections?meta=ok`, req.url));
}
