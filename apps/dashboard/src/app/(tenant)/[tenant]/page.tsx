import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCampaignsInsights, getDailyInsights, getDemographics } from "@/server/integrations/meta";
import { TrendChart } from "@/components/TrendChart";

export const dynamic = "force-dynamic";

const money = (n: number) => `R$ ${n.toFixed(2)}`;
const PALETTE = ["#2563eb", "#16a34a", "#db2777", "#ea580c", "#7c3aed", "#0891b2", "#ca8a04"];

function Card({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}

function StatusTag({ status }: { status: string | null }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
      {status || "—"}
    </span>
  );
}

/** Barra horizontal simples para demografia. */
function Bars({ data, total, color }: { data: [string, number][]; total: number; color: string }) {
  return (
    <div className="space-y-1">
      {data.map(([label, v]) => (
        <div key={label} className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-neutral-500">{label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-neutral-100">
            <div className="h-full rounded" style={{ width: `${total ? (v / total) * 100 : 0}%`, background: color }} />
          </div>
          <span className="w-12 shrink-0 text-right text-neutral-600">
            {total ? Math.round((v / total) * 100) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { tenant } = await params;
  const sp = await searchParams;
  await requireUser();
  await assertTenantAccess(tenant);

  const days = sp.d === "7" ? 7 : sp.d === "90" ? 90 : 30;
  const supabase = await createSupabaseServerClient();
  const now = Date.now();
  const sinceDate = new Date(now - (days - 1) * 864e5);
  const since30 = sinceDate.toISOString();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const sinceYmd = ymd(sinceDate);
  const untilYmd = ymd(new Date(now));

  const ev = (type: string) =>
    supabase.from("event").select("id", { count: "exact", head: true }).eq("tenant_id", tenant).eq("event_type", type);

  const [
    { count: leads },
    { count: leads30 },
    { count: waClicks },
    { count: messages },
    { count: purchases },
    { count: conversions },
    { count: bioLeads },
    { data: leadDays },
    campaigns,
    daily,
    demo,
  ] = await Promise.all([
    supabase.from("lead").select("id", { count: "exact", head: true }).eq("tenant_id", tenant),
    supabase.from("lead").select("id", { count: "exact", head: true }).eq("tenant_id", tenant).gte("created_at", since30),
    ev("WHATSAPP_CLICK"),
    ev("MESSAGE_RECEIVED"),
    ev("PURCHASE"),
    supabase.from("event").select("id", { count: "exact", head: true }).eq("tenant_id", tenant).eq("attributed", true).in("event_type", ["PURCHASE", "MESSAGE_RECEIVED"]),
    supabase.from("click").select("id", { count: "exact", head: true }).eq("tenant_id", tenant).eq("utm_content", "link_in_bio").gte("clicked_at", since30),
    supabase.from("lead").select("created_at").eq("tenant_id", tenant).gte("created_at", since30),
    getCampaignsInsights(tenant, null, sinceYmd, untilYmd),
    getDailyInsights(tenant, null, sinceYmd, untilYmd),
    getDemographics(tenant, null, sinceYmd, untilYmd),
  ]);

  const spend30 = campaigns.reduce((s, c) => s + c.spend, 0);

  // Eixo do tempo e séries.
  const dayLabels: string[] = [];
  for (let i = days - 1; i >= 0; i--) dayLabels.push(ymd(new Date(now - i * 864e5)));

  const leadsByDay = new Map<string, number>();
  for (const l of leadDays ?? []) {
    const d = ymd(new Date(l.created_at as string));
    leadsByDay.set(d, (leadsByDay.get(d) ?? 0) + 1);
  }
  const leadsSeries = [{ name: "Leads/dia", color: "#2563eb", values: dayLabels.map((d) => leadsByDay.get(d) ?? 0) }];

  const campNames = [...new Set(daily.map((p) => p.campaign))].slice(0, 6);
  const spendSeries = campNames.map((name, i) => {
    const byDay = new Map<string, number>();
    for (const p of daily) if (p.campaign === name) byDay.set(p.date, (byDay.get(p.date) ?? 0) + p.spend);
    return { name, color: PALETTE[i % PALETTE.length]!, values: dayLabels.map((d) => byDay.get(d) ?? 0) };
  });

  // Demografia (por impressões = quem viu os anúncios).
  const ageMap = new Map<string, number>();
  const genderMap = new Map<string, number>();
  let demoTotal = 0;
  for (const d of demo) {
    ageMap.set(d.age, (ageMap.get(d.age) ?? 0) + d.impressions);
    const g = d.gender === "male" ? "Homens" : d.gender === "female" ? "Mulheres" : "Outro";
    genderMap.set(g, (genderMap.get(g) ?? 0) + d.impressions);
    demoTotal += d.impressions;
  }
  const ageData = [...ageMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const genderData = [...genderMap.entries()].sort((a, b) => b[1] - a[1]);

  const profileCampaign = campaigns.find((c) => /perfil/i.test(c.name) || c.objective === "OUTCOME_TRAFFIC");
  const bio = bioLeads ?? 0;
  const costPerBio = profileCampaign && bio > 0 ? profileCampaign.spend / bio : null;

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex gap-1 text-sm">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`?d=${d}`}
              className={`rounded-lg px-3 py-1.5 ${
                days === d ? "bg-neutral-900 text-white" : "border bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card label="Leads (total)" value={leads ?? 0} sub={`${leads30 ?? 0} nos últimos ${days} dias`} />
        <Card label="Conversões atribuídas" value={conversions ?? 0} accent="text-emerald-600" sub="WhatsApp + vendas" />
        <Card label="Compras" value={purchases ?? 0} sub="Nuvemshop + WhatsApp" />
        <Card label="Gasto Meta (30d)" value={money(spend30)} />
      </section>

      {/* Evolução */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 text-sm font-medium text-neutral-700">Evolução de leads ({days}d)</h2>
          <TrendChart labels={dayLabels} series={leadsSeries} title={`Evolução de leads (${days}d)`} />
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 text-sm font-medium text-neutral-700">Gasto por campanha ({days}d)</h2>
          {spendSeries.length > 0 ? (
            <TrendChart labels={dayLabels} series={spendSeries} prefix="R$ " title={`Gasto por campanha (${days}d)`} />
          ) : (
            <p className="text-sm text-neutral-400">Sem dados de anúncios no período.</p>
          )}
        </div>
      </section>

      {/* Estimativa tráfego p/ perfil → bio */}
      {profileCampaign && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-900">Tráfego p/ perfil → Instagram (bio) · estimativa</p>
          <div className="mt-2 flex flex-wrap gap-6 text-sm">
            <div><p className="text-neutral-500">Campanha</p><p className="font-medium">{profileCampaign.name}</p></div>
            <div><p className="text-neutral-500">Gasto</p><p className="font-semibold">{money(profileCampaign.spend)}</p></div>
            <div><p className="text-neutral-500">Leads pela bio</p><p className="font-semibold">{bio}</p></div>
            <div><p className="text-neutral-500">Custo/lead (estim.)</p><p className="font-semibold text-blue-700">{costPerBio != null ? money(costPerBio) : "—"}</p></div>
          </div>
        </section>
      )}

      {/* Métricas por campanha */}
      {campaigns.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-700">Métricas por campanha (30d)</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-neutral-500">
                  <th className="py-2">Campanha</th><th>Status</th>
                  <th className="text-right">Gasto</th><th className="text-right">Impr.</th>
                  <th className="text-right">Cliques</th><th className="text-right">CTR</th>
                  <th className="text-right">CPC</th><th className="text-right">CPM</th>
                </tr>
              </thead>
              <tbody>
                {[...campaigns].sort((a, b) => b.spend - a.spend).map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-2 pr-2 font-medium">{c.name}</td>
                    <td><StatusTag status={c.status} /></td>
                    <td className="text-right">{money(c.spend)}</td>
                    <td className="text-right">{c.impressions.toLocaleString("pt-BR")}</td>
                    <td className="text-right">{c.clicks.toLocaleString("pt-BR")}</td>
                    <td className="text-right">{c.ctr.toFixed(2)}%</td>
                    <td className="text-right">{money(c.cpc)}</td>
                    <td className="text-right">{money(c.cpm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Demografia */}
      {demoTotal > 0 && (
        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-5">
            <h2 className="mb-3 text-sm font-medium text-neutral-700">Público por idade</h2>
            <Bars data={ageData} total={demoTotal} color="#2563eb" />
          </div>
          <div className="rounded-xl border bg-white p-5">
            <h2 className="mb-3 text-sm font-medium text-neutral-700">Público por gênero</h2>
            <Bars data={genderData} total={demoTotal} color="#db2777" />
          </div>
        </section>
      )}

      {/* Por canal */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500">Por canal</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card label="Site — cliques WhatsApp" value={waClicks ?? 0} />
          <Card label="WhatsApp — mensagens" value={messages ?? 0} />
          <Card label="Leads pela bio (30d)" value={bio} />
          <Card label="Compras" value={purchases ?? 0} />
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        <Link href={`/${tenant}/leads`} className="rounded-xl border bg-white px-4 py-3 text-sm font-medium hover:bg-neutral-50">Ver leads →</Link>
        <Link href={`/${tenant}/campaigns`} className="rounded-xl border bg-white px-4 py-3 text-sm font-medium hover:bg-neutral-50">Campanhas e criativos →</Link>
        <Link href={`/${tenant}/heatmap`} className="rounded-xl border bg-white px-4 py-3 text-sm font-medium hover:bg-neutral-50">Mapa de calor →</Link>
      </section>
    </main>
  );
}
