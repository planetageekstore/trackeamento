"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth";
import { disconnectWhatsApp } from "@/server/integrations/uazapi";
import { disconnectNuvemshop } from "@/server/integrations/nuvemshop";

/** Normaliza uma entrada (URL completa ou host) para apenas o hostname. */
function toHost(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return "";
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return u.hostname;
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

export async function addDomain(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  const host = toHost(String(formData.get("domain") ?? ""));
  if (!tenantId || !host) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("tenant_domain").insert({ tenant_id: tenantId, domain: host });
  revalidatePath(`/${tenantId}`);
}

export async function removeDomain(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  const id = String(formData.get("domainId") ?? "");
  if (!tenantId || !id) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("tenant_domain").delete().eq("id", id).eq("tenant_id", tenantId);
  revalidatePath(`/${tenantId}`);
}

/** Cancela uma integração (meta/google/nuvemshop/whatsapp) do cliente. */
export async function disconnectIntegration(formData: FormData): Promise<void> {
  await requireUser();
  const tenantId = String(formData.get("tenantId") ?? "");
  const provider = String(formData.get("provider") ?? "");
  if (!tenantId || !provider) return;

  // Verifica acesso ao tenant (RLS na sessão do usuário).
  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase.from("tenant").select("id").eq("id", tenantId).maybeSingle();
  if (!tenant) throw new Error("Sem acesso a este cliente.");

  if (provider === "whatsapp") {
    await disconnectWhatsApp(tenantId);
  } else if (provider === "nuvemshop") {
    await disconnectNuvemshop(tenantId);
  } else if (provider === "meta" || provider === "google") {
    await createSupabaseServiceClient()
      .from("integration")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("provider", provider);
  }

  revalidatePath(`/${tenantId}`);
  revalidatePath(`/${tenantId}/meta`);
}
