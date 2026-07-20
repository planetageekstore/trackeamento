import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getCampaignsInsights, getDailyInsights, getDemographics } from "@/server/integrations/meta";
import { anthropicClient, textOf, parseBlocks, type AiBlock } from "@/server/aiBlocks";

const MODEL = "claude-opus-4-8";

/** Seções fixas do relatório, na ordem de saída. */
export const REPORT_BLOCKS: AiBlock[] = [
  { key: "analise", emoji: "📊", title: "ANÁLISE DO PERÍODO" },
  { key: "positivo", emoji: "✅", title: "PONTO POSITIVO" },
  { key: "melhoria", emoji: "⚠️", title: "PONTOS DE MELHORIA" },
  { key: "proximos", emoji: "🎯", title: "PRÓXIMOS PASSOS" },
];

export interface CampaignLite {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  reach: number;
  frequency: number;
  results: number;
  revenue: number;
  roas: number;
}

export interface ReportMetrics {
  period: { since: string; until: string; days: number };
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    ctr: number;
    cpc: number;
    cpm: number;
    frequency: number;
    leads: number;
    conversas: number;
    purchases: number;
    revenue: number;
    roas: number;
    cpl: number;
    custoConversa: number;
  };
  prev: { spend: number; leads: number; conversas: number; purchases: number } | null;
  campaigns: CampaignLite[];
  daily: { date: string; spend: number; clicks: number; leads: number }[];
  demographics: { age: string; gender: string; impressions: number }[];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function countEvents(
  db: ReturnType<typeof createSupabaseServiceClient>,
  tenant: string,
  type: string,
  sinceIso: string,
  untilIso: string,
): Promise<number> {
  const { count } = await db
    .from("event")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant)
    .eq("event_type", type)
    .gte("occurred_at", sinceIso)
    .lte("occurred_at", untilIso);
  return count ?? 0;
}

async function countLeads(
  db: ReturnType<typeof createSupabaseServiceClient>,
  tenant: string,
  sinceIso: string,
  untilIso: string,
): Promise<number> {
  const { count } = await db
    .from("lead")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant)
    .gte("created_at", sinceIso)
    .lte("created_at", untilIso);
  return count ?? 0;
}

/**
 * Reúne o retrato de métricas do período (Meta + resultados próprios) para
 * alimentar a IA e congelar no relatório salvo.
 */
export async function gatherReportMetrics(
  tenant: string,
  since: string,
  until: string,
): Promise<ReportMetrics> {
  const db = createSupabaseServiceClient();
  const sinceDate = new Date(since + "T00:00:00-03:00");
  const untilDate = new Date(until + "T23:59:59-03:00");
  const days = Math.max(1, Math.round((untilDate.getTime() - sinceDate.getTime()) / 864e5));
  const prevUntil = new Date(sinceDate.getTime() - 864e5);
  const prevSince = new Date(prevUntil.getTime() - (days - 1) * 864e5);

  const [campaigns, daily, demo, leads, conversas, purchases, prevCampaigns, prevLeads, prevConversas, prevPurchases] =
    await Promise.all([
      getCampaignsInsights(tenant, null, since, until),
      getDailyInsights(tenant, null, since, until),
      getDemographics(tenant, null, since, until),
      countLeads(db, tenant, sinceDate.toISOString(), untilDate.toISOString()),
      countEvents(db, tenant, "MESSAGE_RECEIVED", sinceDate.toISOString(), untilDate.toISOString()),
      countEvents(db, tenant, "PURCHASE", sinceDate.toISOString(), untilDate.toISOString()),
      getCampaignsInsights(tenant, null, ymd(prevSince), ymd(prevUntil)),
      countLeads(db, tenant, prevSince.toISOString(), prevUntil.toISOString()),
      countEvents(db, tenant, "MESSAGE_RECEIVED", prevSince.toISOString(), prevUntil.toISOString()),
      countEvents(db, tenant, "PURCHASE", prevSince.toISOString(), prevUntil.toISOString()),
    ]);

  const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);
  const spend = sum(campaigns.map((c) => c.spend));
  const impressions = sum(campaigns.map((c) => c.impressions));
  const clicks = sum(campaigns.map((c) => c.clicks));
  const reach = sum(campaigns.map((c) => c.reach));
  const revenue = sum(campaigns.map((c) => c.revenue));
  const frequency = campaigns.length ? sum(campaigns.map((c) => c.frequency)) / campaigns.length : 0;

  // Leads/dia (dos dados próprios) para a série diária.
  const { data: leadDays } = await db
    .from("lead")
    .select("created_at")
    .eq("tenant_id", tenant)
    .gte("created_at", sinceDate.toISOString())
    .lte("created_at", untilDate.toISOString());
  const leadsByDay = new Map<string, number>();
  for (const l of leadDays ?? []) {
    const d = new Date(l.created_at as string).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    leadsByDay.set(d, (leadsByDay.get(d) ?? 0) + 1);
  }
  const dailyAgg = new Map<string, { spend: number; clicks: number }>();
  for (const p of daily) {
    const cur = dailyAgg.get(p.date) ?? { spend: 0, clicks: 0 };
    cur.spend += p.spend;
    cur.clicks += p.clicks;
    dailyAgg.set(p.date, cur);
  }
  const allDates = new Set<string>([...dailyAgg.keys(), ...leadsByDay.keys()]);
  const dailyOut = [...allDates].sort().map((date) => ({
    date,
    spend: dailyAgg.get(date)?.spend ?? 0,
    clicks: dailyAgg.get(date)?.clicks ?? 0,
    leads: leadsByDay.get(date) ?? 0,
  }));

  return {
    period: { since, until, days },
    totals: {
      spend,
      impressions,
      clicks,
      reach,
      ctr: impressions ? (clicks / impressions) * 100 : 0,
      cpc: clicks ? spend / clicks : 0,
      cpm: impressions ? (spend / impressions) * 1000 : 0,
      frequency,
      leads,
      conversas,
      purchases,
      revenue,
      roas: spend ? revenue / spend : 0,
      cpl: leads ? spend / leads : 0,
      custoConversa: conversas ? spend / conversas : 0,
    },
    prev: {
      spend: sum(prevCampaigns.map((c) => c.spend)),
      leads: prevLeads,
      conversas: prevConversas,
      purchases: prevPurchases,
    },
    campaigns: campaigns.map((c) => ({
      name: c.name,
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
    })),
    daily: dailyOut,
    demographics: demo.map((d) => ({ age: d.age, gender: d.gender, impressions: d.impressions })),
  };
}

const money = (n: number) => `R$ ${n.toFixed(2)}`;

/** Serializa as métricas num contexto textual legível para a IA. */
function metricsContext(m: ReportMetrics, selected: string[]): string {
  const t = m.totals;
  const sel = new Set(selected);
  const line = (key: string, label: string, value: string) => (sel.size === 0 || sel.has(key) ? `- ${label}: ${value}` : null);
  const totals = [
    line("investimento", "Investimento", money(t.spend)),
    line("impressoes", "Impressões", t.impressions.toLocaleString("pt-BR")),
    line("cliques", "Cliques", t.clicks.toLocaleString("pt-BR")),
    line("ctr", "CTR", `${t.ctr.toFixed(2)}%`),
    line("cpc", "CPC", money(t.cpc)),
    line("cpm", "CPM", money(t.cpm)),
    line("alcance", "Alcance", t.reach.toLocaleString("pt-BR")),
    line("frequencia", "Frequência", t.frequency.toFixed(2)),
    line("leads", "Leads", String(t.leads)),
    line("cpl", "CPL", money(t.cpl)),
    line("conversas", "Conversas iniciadas", String(t.conversas)),
    line("custo_conversa", "Custo por conversa", money(t.custoConversa)),
    line("compras", "Compras", String(t.purchases)),
    line("receita", "Receita", money(t.revenue)),
    line("roas", "ROAS", t.roas.toFixed(2)),
  ].filter(Boolean);

  const prev = m.prev
    ? [
        `Período anterior (mesma duração, ${m.period.days} dias):`,
        `- Investimento: ${money(m.prev.spend)}`,
        `- Leads: ${m.prev.leads}`,
        `- Conversas: ${m.prev.conversas}`,
        `- Compras: ${m.prev.purchases}`,
      ].join("\n")
    : "Sem período anterior comparável.";

  const camps = m.campaigns.length
    ? m.campaigns
        .slice(0, 15)
        .map(
          (c) =>
            `- ${c.name}: gasto ${money(c.spend)}, ${c.clicks} cliques, CTR ${c.ctr.toFixed(2)}%, ${c.results} resultados, ROAS ${c.roas.toFixed(2)}`,
        )
        .join("\n")
    : "Sem campanhas Meta no período (ou Meta não conectado).";

  const topDemo = [...m.demographics]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 6)
    .map((d) => `- ${d.age} / ${d.gender}: ${d.impressions.toLocaleString("pt-BR")} impressões`)
    .join("\n");

  return [
    `Período: ${m.period.since} a ${m.period.until} (${m.period.days} dias).`,
    "",
    "TOTAIS DO PERÍODO:",
    ...totals,
    "",
    prev,
    "",
    "POR CAMPANHA:",
    camps,
    "",
    "DEMOGRAFIA (top por impressões):",
    topDemo || "- sem dados",
  ].join("\n");
}

const SYSTEM_PROMPT = `Você é um gestor de tráfego sênior escrevendo o relatório da semana para o dono do negócio (cliente da agência). Português do Brasil, tom profissional e direto.

REGRAS INEGOCIÁVEIS:
- Baseie-se SOMENTE nos números fornecidos. NUNCA invente métrica que não foi dada.
- Se uma métrica não foi fornecida, não a cite.
- Coloque os números em contexto (comparando com o período anterior quando houver, e entre campanhas).
- Seja honesto: aponte o que está caro ou fraco sem suavizar, mas com recomendação prática.

FORMATO DE SAÍDA (OBRIGATÓRIO): responda APENAS com os 4 blocos abaixo, cada um começando EXATAMENTE por "## " + emoji + título. Nada antes do primeiro nem depois do último.

## 📊 ANÁLISE DO PERÍODO
(o que aconteceu no período, os números em contexto e a leitura geral)

## ✅ PONTO POSITIVO
(o maior destaque positivo do período, com o número que o sustenta)

## ⚠️ PONTOS DE MELHORIA
(o que está caro, fraco ou desperdiçando verba, e por quê)

## 🎯 PRÓXIMOS PASSOS
(recomendações acionáveis: orçamento, criativos, segmentação, campanhas a escalar/pausar)`;

export interface GeneratedReport {
  outputMd: string;
  blocks: Record<string, string>;
  model: string;
}

/** Gera o relatório completo (4 seções) a partir das métricas do período. */
export async function generateReport(m: ReportMetrics, selected: string[]): Promise<GeneratedReport> {
  const stream = anthropicClient().messages.stream({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Escreva o relatório com base nestes dados:\n\n${metricsContext(m, selected)}` }],
  });
  const outputMd = textOf(await stream.finalMessage());
  return { outputMd, blocks: parseBlocks(outputMd, REPORT_BLOCKS), model: MODEL };
}

/** Regenera apenas UMA seção do relatório. */
export async function regenerateReportBlock(
  m: ReportMetrics,
  selected: string[],
  currentMd: string,
  blockKey: string,
): Promise<string> {
  const block = REPORT_BLOCKS.find((b) => b.key === blockKey);
  if (!block) throw new Error(`Seção desconhecida: ${blockKey}`);

  const stream = anthropicClient().messages.stream({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: `Dados do período:\n\n${metricsContext(m, selected)}` },
      { role: "assistant", content: currentMd },
      {
        role: "user",
        content:
          `Regenere APENAS a seção "${block.emoji} ${block.title}", mantendo coerência com o restante. ` +
          `Responda somente com essa seção, começando pelo cabeçalho "## ${block.emoji} ${block.title}".`,
      },
    ],
  });
  const md = textOf(await stream.finalMessage());
  const parsed = parseBlocks(md, REPORT_BLOCKS);
  return parsed[blockKey] || md.replace(/^##.*$/m, "").trim();
}
