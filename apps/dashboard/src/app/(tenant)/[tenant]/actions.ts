"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

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
