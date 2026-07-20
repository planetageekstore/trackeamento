"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { qualifyLead } from "@/server/leadQualification";

/** Reanalisa (qualifica) um lead sob demanda. */
export async function reanalisarLead(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  if (!tenantId || !leadId) throw new Error("Parâmetros inválidos.");

  // Garante acesso (RLS).
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenant").select("id").eq("id", tenantId).maybeSingle();
  if (!data) throw new Error("Sem acesso a este cliente.");

  await qualifyLead(tenantId, leadId);
  revalidatePath(`/${tenantId}/leads/${leadId}`);
}
