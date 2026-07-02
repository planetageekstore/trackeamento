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
  const { data } = await supabase.from("tenant").select("name").eq("id", tenant).maybeSingle();

  return (
    <div className="flex min-h-screen">
      <Sidebar tenant={tenant} tenantName={data?.name ?? "Cliente"} />
      <div className="flex-1 overflow-x-hidden">{children}</div>
    </div>
  );
}
