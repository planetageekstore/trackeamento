"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser, resolveScope } from "@/lib/auth";
import { generateSiteKey } from "@/server/tenant";

/** Cria um novo cliente (tenant) sob a agência do usuário logado. */
export async function createTenant(formData: FormData): Promise<void> {
  await requireUser();
  const scope = await resolveScope();
  if (!scope.isAgencyAdmin || !scope.agencyId) {
    throw new Error("Apenas administradores da agência podem criar clientes.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const domainsRaw = String(formData.get("domains") ?? "");
  if (!name) throw new Error("Nome do cliente é obrigatório.");

  const supabase = await createSupabaseServerClient();
  const siteKey = generateSiteKey();

  const { data: tenant, error } = await supabase
    .from("tenant")
    .insert({ agency_id: scope.agencyId, name, site_key: siteKey })
    .select("id")
    .single();
  if (error || !tenant) throw error ?? new Error("Falha ao criar o cliente.");

  const domains = domainsRaw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (domains.length > 0) {
    await supabase
      .from("tenant_domain")
      .insert(domains.map((domain) => ({ tenant_id: tenant.id, domain })));
  }

  revalidatePath("/tenants");
}
