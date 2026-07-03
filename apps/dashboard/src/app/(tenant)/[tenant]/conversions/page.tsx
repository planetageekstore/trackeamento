import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/date";

export const dynamic = "force-dynamic";

interface ConversionRow {
  event_type: string;
  value: number | null;
  currency: string;
  attributed: boolean;
  occurred_at: string;
  lead: { tracking_code: string } | null;
}

export default async function ConversionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ nuvemshop?: string }>;
}) {
  const { tenant } = await params;
  const { nuvemshop } = await searchParams;
  await requireUser();
  await assertTenantAccess(tenant);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("event")
    .select("event_type, value, currency, attributed, occurred_at, lead:lead_id(tracking_code)")
    .eq("tenant_id", tenant)
    .in("event_type", ["PURCHASE", "MESSAGE_RECEIVED"])
    .order("occurred_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as unknown as ConversionRow[];

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Conversões</h1>
        <Link
          href={`/api/oauth/nuvemshop/start?tenant=${tenant}`}
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white"
        >
          Conectar Nuvemshop
        </Link>
      </div>

      {nuvemshop === "ok" && <p className="rounded bg-emerald-100 p-3 text-emerald-800">Loja conectada!</p>}
      {nuvemshop === "erro" && <p className="rounded bg-red-100 p-3 text-red-800">Falha ao conectar a loja.</p>}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            <th className="py-2">Tipo</th>
            <th>Lead (TRK)</th>
            <th>Valor</th>
            <th>Atribuída</th>
            <th>Quando</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b">
              <td className="py-2">{r.event_type}</td>
              <td className="font-mono text-xs">{r.lead?.tracking_code ?? "—"}</td>
              <td>{r.value != null ? `${r.currency} ${r.value}` : "—"}</td>
              <td>{r.attributed ? "✓" : "—"}</td>
              <td>{fmtDateTime(r.occurred_at)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-neutral-500">
                Nenhuma conversão ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
