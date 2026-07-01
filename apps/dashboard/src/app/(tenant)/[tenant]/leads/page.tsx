import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface LeadRow {
  id: string;
  tracking_code: string;
  phone: string | null;
  email: string | null;
  created_at: string;
}

export default async function LeadsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireUser();
  await assertTenantAccess(tenant);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("lead")
    .select("id, tracking_code, phone, email, created_at")
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: false })
    .limit(100);
  const leads = (data ?? []) as LeadRow[];

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-xl font-semibold">Leads</h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            <th className="py-2">Tracking ID</th>
            <th>Telefone</th>
            <th>E-mail</th>
            <th>Criado em</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-2">
                <Link href={`/${tenant}/leads/${l.id}`} className="font-mono hover:underline">
                  {l.tracking_code}
                </Link>
              </td>
              <td>{l.phone ?? "—"}</td>
              <td>{l.email ?? "—"}</td>
              <td>{new Date(l.created_at).toLocaleString("pt-BR")}</td>
            </tr>
          ))}
          {leads.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-neutral-500">
                Nenhum lead capturado ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
