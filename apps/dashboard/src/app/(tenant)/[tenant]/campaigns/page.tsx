import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { importCosts } from "./actions";

export const dynamic = "force-dynamic";

interface CostRow {
  provider: string;
  campaign_id: string;
  campaign_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
}

export default async function CampaignsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireUser();
  await assertTenantAccess(tenant);

  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  const [{ data: costs }, { count: conversions }] = await Promise.all([
    supabase
      .from("campaign_cost")
      .select("provider, campaign_id, campaign_name, spend, impressions, clicks")
      .eq("tenant_id", tenant)
      .gte("date", since),
    supabase
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant)
      .eq("attributed", true)
      .in("event_type", ["PURCHASE", "MESSAGE_RECEIVED"]),
  ]);

  // Agrega custo por campanha no período.
  const agg = new Map<string, CostRow>();
  for (const c of (costs ?? []) as CostRow[]) {
    const key = `${c.provider}:${c.campaign_id}`;
    const cur = agg.get(key) ?? { ...c, spend: 0, impressions: 0, clicks: 0 };
    cur.spend += Number(c.spend);
    cur.impressions += Number(c.impressions);
    cur.clicks += Number(c.clicks);
    agg.set(key, cur);
  }
  const rows = [...agg.values()].sort((a, b) => b.spend - a.spend);
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Campanhas (últimos 30 dias)</h1>
        <form action={importCosts}>
          <input type="hidden" name="tenantId" value={tenant} />
          <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50">
            Importar agora
          </button>
        </form>
      </div>

      <div className="flex gap-6 text-sm">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-neutral-500">Gasto total</p>
          <p className="text-lg font-semibold">R$ {totalSpend.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-neutral-500">Conversões atribuídas</p>
          <p className="text-lg font-semibold">{conversions ?? 0}</p>
        </div>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            <th className="py-2">Canal</th>
            <th>Campanha</th>
            <th>Gasto</th>
            <th>Impressões</th>
            <th>Cliques</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.provider}:${r.campaign_id}`} className="border-b">
              <td className="py-2">{r.provider}</td>
              <td>{r.campaign_name ?? r.campaign_id}</td>
              <td>R$ {r.spend.toFixed(2)}</td>
              <td>{r.impressions}</td>
              <td>{r.clicks}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-neutral-500">
                Sem dados de custo. Conecte Meta/Google em Conexões.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
