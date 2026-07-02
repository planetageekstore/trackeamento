import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { connectWhatsApp } from "@/server/integrations/uazapi";

export const runtime = "nodejs";

/** Verifica (via RLS/sessão) se o usuário pode operar este tenant. */
async function canAccess(tenantId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("tenant").select("id").eq("id", tenantId).maybeSingle();
  return Boolean(data);
}

export async function POST(req: NextRequest): Promise<Response> {
  const { tenantId } = (await req.json().catch(() => ({}))) as { tenantId?: string };
  if (!tenantId) return Response.json({ error: "tenantId obrigatório" }, { status: 400 });
  if (!(await canAccess(tenantId))) return Response.json({ error: "forbidden" }, { status: 403 });

  try {
    return Response.json(await connectWhatsApp(tenantId, req.nextUrl.origin));
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
