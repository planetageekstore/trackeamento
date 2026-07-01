"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { importMetaCosts } from "@/server/integrations/meta";
import { importGoogleCosts } from "@/server/integrations/google";

/** Importa custos (Meta + Google) dos últimos 30 dias sob demanda. */
export async function importCosts(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return;

  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase.from("tenant").select("id").eq("id", tenantId).maybeSingle();
  if (!tenant) throw new Error("Sem acesso a este cliente.");

  await Promise.allSettled([importMetaCosts(tenantId, 30), importGoogleCosts(tenantId)]);
  revalidatePath(`/${tenantId}/campaigns`);
}
