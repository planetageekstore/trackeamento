import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/date";
import { ReportBuilder } from "./ReportBuilder";

export const dynamic = "force-dynamic";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

interface SavedReport {
  id: string;
  period_start: string;
  period_end: string;
  manager_opinion: string | null;
  created_at: string;
}

export default async function AnalisePage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireUser();
  await assertTenantAccess(tenant);

  const now = new Date();
  const defUntil = ymd(now);
  const defSince = ymd(new Date(now.getTime() - 6 * 864e5));

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("report")
    .select("id, period_start, period_end, manager_opinion, created_at")
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: false })
    .limit(20);
  const saved = (data ?? []) as SavedReport[];

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <div>
        <h1 className="text-xl font-semibold">Análise</h1>
        <p className="text-sm text-neutral-500">
          Escolha o período e as métricas, gere um relatório detalhado com IA e salve com a sua opinião.
        </p>
      </div>

      <ReportBuilder tenant={tenant} defaultSince={defSince} defaultUntil={defUntil} />

      {saved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-700">Relatórios salvos</h2>
          <ul className="divide-y rounded-xl border bg-white">
            {saved.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {fmtDateTime(r.period_start, { day: "2-digit", month: "2-digit", year: "numeric" })} –{" "}
                    {fmtDateTime(r.period_end, { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </p>
                  {r.manager_opinion && (
                    <p className="truncate text-xs text-neutral-500">{r.manager_opinion}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-neutral-400">
                  {fmtDateTime(r.created_at, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
