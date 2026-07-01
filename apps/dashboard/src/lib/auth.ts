import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { RoleType } from "@trk/shared";
import { createSupabaseServerClient } from "./supabase/server";

export interface Membership {
  id: string;
  role: RoleType;
  agency_id: string | null;
  tenant_id: string | null;
}

/** Retorna o usuário logado ou null. */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

/** Garante usuário autenticado; redireciona para /login caso contrário. */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Carrega os vínculos (memberships) do usuário logado. */
export async function getMemberships(): Promise<Membership[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("membership")
    .select("id, role, agency_id, tenant_id");
  if (error) throw error;
  return (data ?? []) as Membership[];
}

/** Escopo resolvido do usuário para decisões de UI/rota. */
export interface UserScope {
  isAgencyAdmin: boolean;
  agencyId: string | null;
  tenantIds: string[];
}

export async function resolveScope(): Promise<UserScope> {
  const memberships = await getMemberships();
  const admin = memberships.find((m) => m.role === "agency_admin");
  return {
    isAgencyAdmin: Boolean(admin),
    agencyId: admin?.agency_id ?? null,
    tenantIds: memberships
      .filter((m) => m.role === "client_user" && m.tenant_id)
      .map((m) => m.tenant_id!),
  };
}

/**
 * Garante que o usuário pode acessar `tenantId`. A verificação final de
 * isolamento é feita pela RLS no banco; este guard melhora a UX (404/redirect).
 */
export async function assertTenantAccess(tenantId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenant").select("id").eq("id", tenantId).maybeSingle();
  if (!data) redirect("/tenants");
}
