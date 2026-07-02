import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { listAdAccounts, getAdsReport } from "@/server/integrations/meta";

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

export default async function MetaAdsPage({
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
  const since = sp.since ?? ymd(new Date(Date.now() - 7 * 864e5));

  const rows = account ? await getAdsReport(tenant, account, since, until) : [];
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <Link href={`/${tenant}/meta`} className="text-sm text-neutral-500 hover:underline">
          ← Meta Ads
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Anúncios e criativos</h1>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-lg border bg-white p-4 text-sm text-neutral-500">
          Nenhuma conta de anúncios encontrada. Conecte o Meta em{" "}
          <Link href={`/${tenant}/meta`} className="underline">
            Meta Ads
          </Link>
          .
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
              <p className="text-neutral-500">Anúncios</p>
              <p className="text-lg font-semibold">{rows.length}</p>
            </div>
          </div>

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
