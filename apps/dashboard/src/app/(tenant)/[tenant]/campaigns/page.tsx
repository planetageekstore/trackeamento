import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAdAccounts, getAdsReport, getCampaignsInsights, getBreakdown, type BreakdownRow } from "@/server/integrations/meta";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function StatusTag({ status }: { status: string }) {
  const active = status === "ACTIVE";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs ${
        active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"
      }`}
    >
      {status || "—"}
    </span>
  );
}

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
    instagram_explore_grid_home: "Explorar (IG)",
    facebook_reels_overlay: "Reels overlay",
    search: "Busca",
    biz_disco_feed: "Descoberta",
  })[k] ?? k;

const deviceLabel = (k: string): string =>
  ({
    iphone: "iPhone",
    ipad: "iPad",
    android_smartphone: "Android (celular)",
    android_tablet: "Android (tablet)",
    desktop: "Desktop",
    other: "Outro",
  })[k] ?? k;

function BreakdownCard({
  title,
  rows,
  tr,
  sortByKey,
}: {
  title: string;
  rows: BreakdownRow[];
  tr?: (k: string) => string;
  sortByKey?: boolean;
}) {
  const total = rows.reduce((s, r) => s + r.spend, 0);
  const list = sortByKey
    ? [...rows].sort((a, b) => a.key.localeCompare(b.key))
    : [...rows].sort((a, b) => b.spend - a.spend).slice(0, 10);
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
                <div
                  className="h-full rounded bg-blue-500"
                  style={{ width: `${total ? (r.spend / total) * 100 : 0}%` }}
                />
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

  const supabase = await createSupabaseServerClient();
  const [accounts, { count: conversions }] = await Promise.all([
    listAdAccounts(tenant),
    supabase
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant)
      .eq("attributed", true)
      .in("event_type", ["PURCHASE", "MESSAGE_RECEIVED"]),
  ]);

  const account = sp.account ?? accounts[0]?.id ?? "";
  const until = sp.until ?? ymd(new Date());
  const since = sp.since ?? ymd(new Date(Date.now() - 30 * 864e5));

  const [rows, campaigns, { count: bioLeads }, byPlacement, byRegion, byDevice, byHour] = account
    ? await Promise.all([
        getAdsReport(tenant, account, since, until),
        getCampaignsInsights(tenant, account, since, until),
        supabase
          .from("click")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant)
          .eq("utm_content", "link_in_bio")
          .gte("clicked_at", since)
          .lte("clicked_at", `${until}T23:59:59`),
        getBreakdown(tenant, account, since, until, "publisher_platform,platform_position", "platform_position"),
        getBreakdown(tenant, account, since, until, "region"),
        getBreakdown(tenant, account, since, until, "impression_device"),
        getBreakdown(tenant, account, since, until, "hourly_stats_aggregated_by_advertiser_time_zone"),
      ])
    : [[], [], { count: 0 }, [], [], [], []];
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);

  // Estimativa A: campanha de tráfego p/ perfil → leads que chegaram pela bio.
  const profileCampaign = campaigns.find(
    (c) => /perfil/i.test(c.name) || c.objective === "OUTCOME_TRAFFIC",
  );
  const bio = bioLeads ?? 0;
  const costPerBioLead = profileCampaign && bio > 0 ? profileCampaign.spend / bio : null;
  const money = (n: number) => `R$ ${n.toFixed(2)}`;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-xl font-semibold">Campanhas e criativos</h1>

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

          <div className="flex gap-6 text-sm">
            <div className="rounded-lg border bg-white p-4">
              <p className="text-neutral-500">Gasto no período</p>
              <p className="text-lg font-semibold">R$ {totalSpend.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-neutral-500">Conversões atribuídas</p>
              <p className="text-lg font-semibold">{conversions ?? 0}</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-neutral-500">Anúncios</p>
              <p className="text-lg font-semibold">{rows.length}</p>
            </div>
          </div>

          {/* Estimativa A: tráfego p/ perfil → leads da bio */}
          {profileCampaign && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-medium text-blue-900">
                Tráfego p/ perfil → Instagram (bio) · estimativa
              </p>
              <div className="mt-2 flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-neutral-500">Campanha</p>
                  <p className="font-medium">{profileCampaign.name}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Gasto</p>
                  <p className="font-semibold">{money(profileCampaign.spend)}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Leads pela bio</p>
                  <p className="font-semibold">{bio}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Custo por lead (estim.)</p>
                  <p className="font-semibold text-blue-700">
                    {costPerBioLead != null ? money(costPerBioLead) : "—"}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Estimativa: o link da bio é fixo, então a atribuição por lead não é exata — mas a
                campanha de tráfego p/ perfil é a principal fonte desses acessos.
              </p>
            </div>
          )}

          {/* Métricas por campanha (CPC / CTR / CPM) */}
          {campaigns.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-neutral-700">Métricas por campanha</h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-neutral-500">
                    <th className="py-2">Campanha</th>
                    <th>Status</th>
                    <th className="text-right">Gasto</th>
                    <th className="text-right">Impr.</th>
                    <th className="text-right">Cliques</th>
                    <th className="text-right">CTR</th>
                    <th className="text-right">CPC</th>
                    <th className="text-right">CPM</th>
                    <th className="text-right">Freq.</th>
                    <th className="text-right">Result.</th>
                    <th className="text-right">Custo/res.</th>
                    <th className="text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {[...campaigns]
                    .sort((a, b) => b.spend - a.spend)
                    .map((c) => (
                      <tr key={c.id} className="border-b">
                        <td className="py-2 pr-2 font-medium">
                          {c.name}
                          <span className="ml-1 text-[10px] text-neutral-400">
                            {(c.objective ?? "").replace("OUTCOME_", "")}
                          </span>
                        </td>
                        <td>
                          <StatusTag status={c.status ?? ""} />
                        </td>
                        <td className="text-right">{money(c.spend)}</td>
                        <td className="text-right">{c.impressions.toLocaleString("pt-BR")}</td>
                        <td className="text-right">{c.clicks.toLocaleString("pt-BR")}</td>
                        <td className="text-right">{c.ctr.toFixed(2)}%</td>
                        <td className="text-right">{money(c.cpc)}</td>
                        <td className="text-right">{money(c.cpm)}</td>
                        <td className="text-right">{c.frequency.toFixed(2)}</td>
                        <td className="text-right">{c.results || "—"}</td>
                        <td className="text-right">{c.results > 0 ? money(c.spend / c.results) : "—"}</td>
                        <td className={`text-right ${c.roas >= 1 ? "text-emerald-600" : ""}`}>
                          {c.roas > 0 ? `${c.roas.toFixed(2)}x` : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Quebras: posicionamento, região, dispositivo, hora */}
          {byPlacement.length + byRegion.length + byDevice.length + byHour.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <BreakdownCard title="Por posicionamento" rows={byPlacement} tr={placementLabel} />
              <BreakdownCard title="Por dispositivo" rows={byDevice} tr={deviceLabel} />
              <BreakdownCard title="Por região" rows={byRegion} />
              <BreakdownCard title="Por hora do dia" rows={byHour} tr={(k) => k.slice(0, 5)} sortByKey />
            </div>
          )}

          <h2 className="mb-2 mt-2 text-sm font-medium text-neutral-700">Anúncios (criativos)</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="py-2">Criativo</th>
                <th>Campanha</th>
                <th>Conjunto</th>
                <th>Anúncio</th>
                <th>Status</th>
                <th className="text-right">Gasto</th>
                <th className="text-right">Impr.</th>
                <th className="text-right">Cliques</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.adId} className="border-b align-middle">
                  <td className="py-2">
                    {r.thumbnail ? (
                      <img src={r.thumbnail} alt="" className="h-11 w-11 rounded object-cover" />
                    ) : (
                      <div className="h-11 w-11 rounded bg-neutral-100" />
                    )}
                  </td>
                  <td className="pr-2">{r.campaign}</td>
                  <td className="pr-2 text-neutral-600">{r.adset}</td>
                  <td className="pr-2 text-neutral-600">{r.ad}</td>
                  <td>
                    <StatusTag status={r.status} />
                  </td>
                  <td className="text-right">R$ {r.spend.toFixed(2)}</td>
                  <td className="text-right">{r.impressions}</td>
                  <td className="text-right">{r.clicks}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-neutral-500">
                    Nenhum anúncio nessa conta/período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
