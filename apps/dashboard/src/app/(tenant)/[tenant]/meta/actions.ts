"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveMetaToken } from "@/server/integrations/meta";

/** Conecta o Meta Ads a partir de um token colado (System User / não expira). */
export async function connectMetaToken(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  const token = String(formData.get("token") ?? "").trim();
  const adAccountId = String(formData.get("adAccountId") ?? "").trim();
  const pixelId = String(formData.get("pixelId") ?? "").trim();
  if (!tenantId || !token) return;

  // Verifica acesso ao tenant (RLS na sessão do usuário) antes de gravar.
  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase.from("tenant").select("id").eq("id", tenantId).maybeSingle();
  if (!tenant) throw new Error("Sem acesso a este cliente.");

  const result = await saveMetaToken(tenantId, token, adAccountId || undefined, pixelId || undefined);
  if (!result.ok) throw new Error("Token inválido — verifique se copiou o token completo.");

  revalidatePath(`/${tenantId}/meta`);
}
