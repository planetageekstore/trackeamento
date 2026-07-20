import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  await requireUser();
  await assertTenantAccess(tenant);

  const supabase = await createSupabaseServerClient();
  // RLS: retorna só os clientes que o usuário pode ver.
  const { data: tenants } = await supabase.from("tenant").select("id, name").order("name");
  const list = (tenants ?? []) as { id: string; name: string }[];

  return (
    <div className="flex min-h-screen">
      <Sidebar tenant={tenant} tenants={list} />
      <div className="flex-1 overflow-x-hidden">{children}</div>
    </div>
  );
}
