import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listAdAccounts,
  getAdsReport,
  getCampaignsInsights,
  getAdsetsInsights,
  getDailyInsights,
  getBreakdown,
  type BreakdownRow,
} from "@/server/integrations/meta";
import { CampaignsView, type Row } from "./CampaignsView";

export const dynamic = "force-dynamic";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const cpaOf = (spend: number, results: number) => (results > 0 ? spend / results : 0);

const placementLabel = (k: string): string =>
  ({
    feed: "Feed",
    instagram_stories: "Stories (IG)",
    facebook_stories: "Stories (FB)",
    instagram_reels: "Reels (IG)",
    facebook_reels: "Reels (FB)",
    instream_video: "Vídeo in-stream",
    right_hand_column: "Coluna direita",
    marketplace: "Marketplace",
    instagram_explore: "Explorar (IG)",
    search: "Busca",
  })[k] ?? k;

const deviceLabel = (k: string): string =>
  ({ iphone: "iPhone", ipad: "iPad", android_smartphone: "Android (celular)", android_tablet: "Android (tablet)", desktop: "Desktop", other: "Outro" })[k] ??
  k;

function BreakdownCard({ title, rows, tr, sortByKey }: { title: string; rows: BreakdownRow[]; tr?: (k: string) => string; sortByKey?: boolean }) {
  const total = rows.reduce((s, r) => s + r.spend, 0);
  const list = sortByKey ? [...rows].sort((a, b) => a.key.localeCompare(b.key)) : [...rows].sort((a, b) => b.spend - a.spend).slice(0, 10);
  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="mb-2 text-sm font-medium text-neutral-700">{title}</h3>
      {list.length === 0 ? (
        <p className="text-xs text-neutral-400">Sem dados no período.</p>
      ) : (
        <div className="space-y-1">
          {list.map((r) => (
            <div key={r.key} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 truncate text-neutral-600" title={r.key}>
                {tr ? tr(r.key) : r.key}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-neutral-100">
                <div className="h-full rounded bg-blue-500" style={{ width: `${total ? (r.spend / total) * 100 : 0}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right text-neutral-600">R$ {r.spend.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ account?: string; since?: string; until?: string }>;
}) {
  const { tenant } = await params;
  const sp = await searchParams;
  await requireUser();
  await assertTenantAccess(tenant);

  const accounts = await listAdAccounts(tenant);
  const account = sp.account ?? accounts[0]?.id ?? "";
  const until = sp.until ?? ymd(new Date());
  const since = sp.since ?? ymd(new Date(Date.now() - 29 * 864e5));

  const [campaignsRaw, adsetsRaw, adsRaw, daily, byPlacement, byRegion, byDevice, byHour] = account
    ? await Promise.all([
        getCampaignsInsights(tenant, account, since, until),
        getAdsetsInsights(tenant, account, since, until),
        getAdsReport(tenant, account, since, until),
        getDailyInsights(tenant, account, since, until),
        getBreakdown(tenant, account, since, until, "publisher_platform,platform_position", "platform_position"),
        getBreakdown(tenant, account, since, until, "region"),
        getBreakdown(tenant, account, since, until, "impression_device"),
        getBreakdown(tenant, account, since, until, "hourly_stats_aggregated_by_advertiser_time_zone"),
      ])
    : [[], [], [], [], [], [], [], []];

  // Normaliza os 3 níveis para o formato Row do CampaignsView.
  const campaigns: Row[] = campaignsRaw.map((c) => ({
    level: "campaign",
    id: c.id,
    name: c.name,
    parent: (c.objective ?? "").replace("OUTCOME_", ""),
    status: c.status ?? "",
    spend: c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    ctr: c.ctr,
    cpc: c.cpc,
    cpm: c.cpm,
    reach: c.reach,
    frequency: c.frequency,
    results: c.results,
    revenue: c.revenue,
    roas: c.roas,
    cpa: cpaOf(c.spend, c.results),
  }));
  const adsets: Row[] = adsetsRaw.map((c) => ({
    level: "adset",
    id: c.id,
    name: c.name,
    parent: c.objective ?? "—", // campanha pai (guardada em objective)
    status: c.status ?? "",
    spend: c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    ctr: c.ctr,
    cpc: c.cpc,
    cpm: c.cpm,
    reach: c.reach,
    frequency: c.frequency,
    results: c.results,
    revenue: c.revenue,
    roas: c.roas,
    cpa: cpaOf(c.spend, c.results),
  }));
  const ads: Row[] = adsRaw.map((a) => ({
    level: "ad",
    id: a.adId,
    name: a.ad,
    parent: a.campaign,
    adset: a.adset,
    thumbnail: a.thumbnail,
    status: a.status,
    spend: a.spend,
    impressions: a.impressions,
    clicks: a.clicks,
    ctr: a.ctr,
    cpc: a.cpc,
    cpm: a.cpm,
    reach: a.reach,
    frequency: a.frequency,
    results: a.results,
    revenue: a.revenue,
    roas: a.roas,
    cpa: cpaOf(a.spend, a.results),
  }));

  // Série diária (totais da conta) para o gráfico de evolução.
  const dayLabels: string[] = [];
  {
    const start = new Date(since + "T00:00:00Z");
    const end = new Date(until + "T00:00:00Z");
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 864e5)) dayLabels.push(ymd(d));
  }
  const byDay = new Map<string, { spend: number; clicks: number; impressions: number }>();
  for (const p of daily) {
    const cur = byDay.get(p.date) ?? { spend: 0, clicks: 0, impressions: 0 };
    cur.spend += p.spend;
    cur.clicks += p.clicks;
    cur.impressions += p.impressions;
    byDay.set(p.date, cur);
  }
  const dailySeries = {
    spend: dayLabels.map((d) => byDay.get(d)?.spend ?? 0),
    clicks: dayLabels.map((d) => byDay.get(d)?.clicks ?? 0),
    impressions: dayLabels.map((d) => byDay.get(d)?.impressions ?? 0),
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-8">
      <h1 className="text-xl font-semibold">Campanhas</h1>

      {accounts.length === 0 ? (
        <p className="rounded-lg border bg-white p-4 text-sm text-neutral-500">
          Meta não conectado. Conecte em{" "}
          <Link href={`/${tenant}/meta`} className="underline">
            Meta Ads
          </Link>{" "}
          para ver campanhas e criativos.
        </p>
      ) : (
        <>
          {/* Filtros: conta (BM) + período */}
          <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Conta de anúncios (BM)</span>
              <select name="account" defaultValue={account} className="rounded-lg border px-3 py-2 text-sm">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">De</span>
              <input type="date" name="since" defaultValue={since} className="rounded-lg border px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Até</span>
              <input type="date" name="until" defaultValue={until} className="rounded-lg border px-3 py-2 text-sm" />
            </label>
            <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">Aplicar</button>
          </form>

          <CampaignsView
            tenant={tenant}
            campaigns={campaigns}
            adsets={adsets}
            ads={ads}
            dailyLabels={dayLabels}
            daily={dailySeries}
          />

          {/* Quebras: posicionamento, região, dispositivo, hora */}
          {byPlacement.length + byRegion.length + byDevice.length + byHour.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-neutral-700">Quebras do período</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <BreakdownCard title="Por posicionamento" rows={byPlacement} tr={placementLabel} />
                <BreakdownCard title="Por dispositivo" rows={byDevice} tr={deviceLabel} />
                <BreakdownCard title="Por região" rows={byRegion} />
                <BreakdownCard title="Por hora do dia" rows={byHour} tr={(k) => k.slice(0, 5)} sortByKey />
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
