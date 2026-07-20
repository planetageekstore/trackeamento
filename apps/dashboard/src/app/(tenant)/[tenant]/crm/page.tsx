import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { CrmBoard, type CrmLead, STAGES } from "./CrmBoard";

export const dynamic = "force-dynamic";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function CrmPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireUser();
  await assertTenantAccess(tenant);

  const db = createSupabaseServiceClient();

  // Leads do tenant (limite generoso; paginação por "carregar mais" fica p/ v2).
  const { data: leadRows } = await db
    .from("lead")
    .select("id, tracking_code, name, phone, stage, stage_source, temperature, last_seen_at")
    .eq("tenant_id", tenant)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(500);
  const leads = leadRows ?? [];
  const leadIds = leads.map((l) => l.id as string);

  // Última qualificação por lead (resumo + estágio sugerido pela IA).
  const qualByLead = new Map<string, { summary: string | null; stage: string }>();
  if (leadIds.length) {
    const { data: quals } = await db
      .from("lead_qualification")
      .select("lead_id, stage, summary, analyzed_at")
      .in("lead_id", leadIds)
      .order("analyzed_at", { ascending: false });
    for (const q of quals ?? []) {
      const lid = q.lead_id as string;
      if (!qualByLead.has(lid)) qualByLead.set(lid, { summary: (q.summary as string) ?? null, stage: q.stage as string });
    }
  }

  // Valor de compra por lead (soma dos PURCHASE).
  const valueByLead = new Map<string, number>();
  if (leadIds.length) {
    const { data: purchases } = await db
      .from("event")
      .select("lead_id, value")
      .eq("tenant_id", tenant)
      .eq("event_type", "PURCHASE")
      .in("lead_id", leadIds);
    for (const p of purchases ?? []) {
      const lid = p.lead_id as string;
      if (lid) valueByLead.set(lid, (valueByLead.get(lid) ?? 0) + Number(p.value ?? 0));
    }
  }

  const crmLeads: CrmLead[] = leads.map((l) => {
    const qual = qualByLead.get(l.id as string);
    const stage = (l.stage as string) || "novo";
    const suggested = qual?.stage && qual.stage !== stage && l.stage_source === "manual" ? qual.stage : null;
    return {
      id: l.id as string,
      name: (l.name as string) || (l.phone as string) || (l.tracking_code as string),
      phone: (l.phone as string) ?? null,
      trackingCode: l.tracking_code as string,
      stage,
      stageSource: (l.stage_source as string) ?? "ai",
      temperature: (l.temperature as string) ?? null,
      summary: qual?.summary ?? null,
      suggestedStage: suggested,
      value: valueByLead.get(l.id as string) ?? 0,
    };
  });

  // Evolução: transições por estágio por dia (últimos 30 dias).
  const since = new Date(Date.now() - 29 * 864e5);
  const { data: history } = await db
    .from("lead_stage_history")
    .select("stage, changed_at")
    .eq("tenant_id", tenant)
    .gte("changed_at", since.toISOString())
    .order("changed_at", { ascending: true });

  const dayLabels: string[] = [];
  for (let i = 29; i >= 0; i--) dayLabels.push(ymd(new Date(Date.now() - i * 864e5)));
  const byStageDay = new Map<string, Map<string, number>>();
  for (const h of history ?? []) {
    const st = h.stage as string;
    const day = new Date(h.changed_at as string).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    if (!byStageDay.has(st)) byStageDay.set(st, new Map());
    const m = byStageDay.get(st)!;
    m.set(day, (m.get(day) ?? 0) + 1);
  }
  const evolution = STAGES.map((s) => ({
    stage: s.key,
    label: s.label,
    values: dayLabels.map((d) => byStageDay.get(s.key)?.get(d) ?? 0),
  }));

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-8">
      <h1 className="text-xl font-semibold">CRM</h1>
      <CrmBoard tenant={tenant} leads={crmLeads} dayLabels={dayLabels} evolution={evolution} />
    </main>
  );
}
