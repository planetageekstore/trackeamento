import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function Card({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}

export default async function DashboardPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireUser();
  await assertTenantAccess(tenant);

  const supabase = await createSupabaseServerClient();
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const ev = (type: string) =>
    supabase.from("event").select("id", { count: "exact", head: true }).eq("tenant_id", tenant).eq("event_type", type);

  const [
    { count: leads },
    { count: leads30 },
    { count: pageViews },
    { count: waClicks },
    { count: messages },
    { count: purchases },
    { count: conversions },
    { data: costs },
  ] = await Promise.all([
    supabase.from("lead").select("id", { count: "exact", head: true }).eq("tenant_id", tenant),
    supabase
      .from("lead")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant)
      .gte("created_at", since30),
    ev("PAGE_VIEW"),
    ev("WHATSAPP_CLICK"),
    ev("MESSAGE_RECEIVED"),
    ev("PURCHASE"),
    supabase
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant)
      .eq("attributed", true)
      .in("event_type", ["PURCHASE", "MESSAGE_RECEIVED"]),
    supabase
      .from("campaign_cost")
      .select("spend")
      .eq("tenant_id", tenant)
      .gte("date", since30.slice(0, 10)),
  ]);

  const spend30 = (costs ?? []).reduce((s, c) => s + Number(c.spend), 0);

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {/* Visão geral */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card label="Leads (total)" value={leads ?? 0} sub={`${leads30 ?? 0} nos últimos 30 dias`} />
        <Card
          label="Conversões atribuídas"
          value={conversions ?? 0}
          accent="text-emerald-600"
          sub="WhatsApp + vendas"
        />
        <Card label="Compras" value={purchases ?? 0} sub="Nuvemshop + WhatsApp" />
        <Card label="Gasto Meta (30d)" value={`R$ ${spend30.toFixed(2)}`} />
      </section>

      {/* Por canal */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500">Por canal</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card label="Site — page views" value={pageViews ?? 0} />
          <Card label="Site — cliques WhatsApp" value={waClicks ?? 0} />
          <Card label="WhatsApp — mensagens" value={messages ?? 0} />
          <Card label="WhatsApp — compras (palavra-chave)" value={purchases ?? 0} />
        </div>
      </section>

      {/* Atalhos */}
      <section className="flex flex-wrap gap-3">
        <Link href={`/${tenant}/leads`} className="rounded-xl border bg-white px-4 py-3 text-sm font-medium hover:bg-neutral-50">
          Ver leads →
        </Link>
        <Link href={`/${tenant}/conversions`} className="rounded-xl border bg-white px-4 py-3 text-sm font-medium hover:bg-neutral-50">
          Ver conversões →
        </Link>
        <Link href={`/${tenant}/campaigns`} className="rounded-xl border bg-white px-4 py-3 text-sm font-medium hover:bg-neutral-50">
          Campanhas e criativos →
        </Link>
      </section>
    </main>
  );
}
