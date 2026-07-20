"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function assertTenant(tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenant").select("id").eq("id", tenantId).maybeSingle();
  if (!data) throw new Error("Sem acesso a este cliente.");
  return supabase;
}

/** Move um lead de estágio manualmente (o manual prevalece sobre a IA). */
export async function moverLead(tenantId: string, leadId: string, stage: string): Promise<{ ok: boolean }> {
  await requireUser();
  const supabase = await assertTenant(tenantId);
  await supabase.from("lead").update({ stage, stage_source: "manual" }).eq("id", leadId).eq("tenant_id", tenantId);
  await supabase.from("lead_stage_history").insert({ tenant_id: tenantId, lead_id: leadId, stage, source: "manual" });
  revalidatePath(`/${tenantId}/crm`);
  return { ok: true };
}

/** Aceita a sugestão de estágio da IA (volta o controle para a IA). */
export async function aceitarSugestaoIA(tenantId: string, leadId: string): Promise<{ ok: boolean }> {
  await requireUser();
  const supabase = await assertTenant(tenantId);
  const { data: q } = await supabase
    .from("lead_qualification")
    .select("stage")
    .eq("lead_id", leadId)
    .order("analyzed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!q?.stage) return { ok: false };
  await supabase
    .from("lead")
    .update({ stage: q.stage as string, stage_source: "ai" })
    .eq("id", leadId)
    .eq("tenant_id", tenantId);
  await supabase
    .from("lead_stage_history")
    .insert({ tenant_id: tenantId, lead_id: leadId, stage: q.stage as string, source: "ai" });
  revalidatePath(`/${tenantId}/crm`);
  return { ok: true };
}
