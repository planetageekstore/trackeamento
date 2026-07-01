import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { whatsappStatus } from "@/server/integrations/whatsapp";

export const runtime = "nodejs";

async function canAccess(tenantId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("tenant").select("id").eq("id", tenantId).maybeSingle();
  return Boolean(data);
}

export async function GET(req: NextRequest): Promise<Response> {
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId obrigatório" }, { status: 400 });
  if (!(await canAccess(tenantId))) return Response.json({ error: "forbidden" }, { status: 403 });

  try {
    const state = await whatsappStatus(tenantId);
    return Response.json({ state });
  } catch {
    return Response.json({ error: "worker_unavailable" }, { status: 502 });
  }
}
