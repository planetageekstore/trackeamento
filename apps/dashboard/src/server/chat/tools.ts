import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  getCampaignsInsights,
  getDailyInsights,
  getAdsReport,
  getBreakdown,
  getDemographics,
} from "@/server/integrations/meta";

/**
 * Ferramentas de leitura do chat (F5), sempre amarradas ao tenant da conversa —
 * a IA nunca escolhe o tenant. Cada função devolve um resumo textual/JSON curto.
 */

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const defRange = () => ({ since: ymd(new Date(Date.now() - 29 * 864e5)), until: ymd(new Date()) });

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_campaign_metrics",
    description: "Métricas por campanha da Meta no período (gasto, cliques, CTR, CPC, resultados, ROAS). Use para perguntas sobre desempenho de campanhas.",
    input_schema: {
      type: "object",
      properties: { since: { type: "string", description: "YYYY-MM-DD" }, until: { type: "string", description: "YYYY-MM-DD" } },
    },
  },
  {
    name: "get_daily_evolution",
    description: "Evolução diária de gasto/cliques por campanha no período. Use para tendências ao longo do tempo.",
    input_schema: { type: "object", properties: { since: { type: "string" }, until: { type: "string" } } },
  },
  {
    name: "get_ads_report",
    description: "Relatório de anúncios (criativos) com gasto/impressões/cliques/resultados no período.",
    input_schema: { type: "object", properties: { since: { type: "string" }, until: { type: "string" } } },
  },
  {
    name: "get_breakdown",
    description: "Quebra de gasto por dimensão. dimension: placement|region|device|age_gender.",
    input_schema: {
      type: "object",
      properties: {
        dimension: { type: "string", enum: ["placement", "region", "device", "age_gender"] },
        since: { type: "string" },
        until: { type: "string" },
      },
      required: ["dimension"],
    },
  },
  {
    name: "query_leads",
    description: "Lista leads do cliente, com estágio/temperatura quando qualificados. Filtros opcionais por estágio e temperatura.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "máx. 50" },
        stage: { type: "string" },
        temperature: { type: "string", enum: ["quente", "morno", "frio"] },
      },
    },
  },
  {
    name: "get_conversions",
    description: "Resumo de conversões no período: leads novos, conversas de WhatsApp, compras e receita.",
    input_schema: { type: "object", properties: { since: { type: "string" }, until: { type: "string" } } },
  },
  {
    name: "get_sessions_summary",
    description: "Resumo das sessões de leads no período: total, sessões com compra e com WhatsApp.",
    input_schema: { type: "object", properties: { since: { type: "string" }, until: { type: "string" } } },
  },
  {
    name: "get_crm_summary",
    description: "Distribuição dos leads pelo funil (estágios) e temperatura, mais os leads quentes recentes. Use para perguntas sobre o CRM/pipeline.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_integration_status",
    description: "Status das integrações do cliente (Meta, Google, Nuvemshop, WhatsApp, GA4): conectado/precisa reconectar.",
    input_schema: { type: "object", properties: {} },
  },
];

function money(n: number) {
  return `R$ ${n.toFixed(2)}`;
}

export async function runTool(tenantId: string, name: string, input: Record<string, unknown>): Promise<string> {
  const db = createSupabaseServiceClient();
  const since = (input.since as string) || defRange().since;
  const until = (input.until as string) || defRange().until;

  switch (name) {
    case "get_campaign_metrics": {
      const rows = await getCampaignsInsights(tenantId, null, since, until);
      if (rows.length === 0) return "Sem campanhas Meta no período (ou Meta não conectado).";
      return rows
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 20)
        .map(
          (c) =>
            `${c.name} [${c.status}]: gasto ${money(c.spend)}, ${c.clicks} cliques, CTR ${c.ctr.toFixed(2)}%, CPC ${money(c.cpc)}, ${c.results} resultados, ROAS ${c.roas.toFixed(2)}`,
        )
        .join("\n");
    }
    case "get_daily_evolution": {
      const daily = await getDailyInsights(tenantId, null, since, until);
      if (daily.length === 0) return "Sem dados diários no período.";
      const byDay = new Map<string, { spend: number; clicks: number }>();
      for (const p of daily) {
        const c = byDay.get(p.date) ?? { spend: 0, clicks: 0 };
        c.spend += p.spend;
        c.clicks += p.clicks;
        byDay.set(p.date, c);
      }
      return [...byDay.entries()]
        .sort()
        .map(([d, v]) => `${d}: ${money(v.spend)}, ${v.clicks} cliques`)
        .join("\n");
    }
    case "get_ads_report": {
      const ads = await getAdsReport(tenantId, null, since, until);
      if (ads.length === 0) return "Sem anúncios no período.";
      return ads
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 25)
        .map((a) => `${a.ad} (${a.campaign}): ${money(a.spend)}, ${a.clicks} cliques, ${a.results} result.`)
        .join("\n");
    }
    case "get_breakdown": {
      const dim = input.dimension as string;
      if (dim === "age_gender") {
        const demo = await getDemographics(tenantId, null, since, until);
        return demo
          .sort((a, b) => b.impressions - a.impressions)
          .slice(0, 12)
          .map((d) => `${d.age}/${d.gender}: ${d.impressions} impr, ${money(d.spend)}`)
          .join("\n");
      }
      const map: Record<string, string> = { placement: "publisher_platform,platform_position", region: "region", device: "impression_device" };
      const bd = await getBreakdown(tenantId, null, since, until, map[dim] ?? "region", dim === "placement" ? "platform_position" : undefined);
      return bd.slice(0, 15).map((r) => `${r.key}: ${money(r.spend)}, ${r.clicks} cliques`).join("\n") || "Sem dados.";
    }
    case "query_leads": {
      const limit = Math.min(Number(input.limit) || 20, 50);
      let q = db
        .from("lead")
        .select("tracking_code, name, phone, stage, temperature, last_seen_at")
        .eq("tenant_id", tenantId)
        .order("last_seen_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (input.stage) q = q.eq("stage", input.stage as string);
      if (input.temperature) q = q.eq("temperature", input.temperature as string);
      const { data } = await q;
      if (!data || data.length === 0) return "Nenhum lead encontrado com esses filtros.";
      return data
        .map((l) => `${l.name ?? l.phone ?? l.tracking_code} — estágio: ${l.stage ?? "—"}, temp: ${l.temperature ?? "—"}`)
        .join("\n");
    }
    case "get_conversions": {
      const s = new Date(since + "T00:00:00-03:00").toISOString();
      const u = new Date(until + "T23:59:59-03:00").toISOString();
      const count = async (type: string) =>
        (await db.from("event").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("event_type", type).gte("occurred_at", s).lte("occurred_at", u)).count ?? 0;
      const leads = (await db.from("lead").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", s).lte("created_at", u)).count ?? 0;
      const [msgs, purchases] = await Promise.all([count("MESSAGE_RECEIVED"), count("PURCHASE")]);
      const { data: rev } = await db.from("event").select("value").eq("tenant_id", tenantId).eq("event_type", "PURCHASE").gte("occurred_at", s).lte("occurred_at", u);
      const receita = (rev ?? []).reduce((a, r) => a + Number(r.value ?? 0), 0);
      return `Período ${since} a ${until}: ${leads} leads novos, ${msgs} conversas de WhatsApp, ${purchases} compras, receita ${money(receita)}.`;
    }
    case "get_sessions_summary": {
      const s = new Date(since + "T00:00:00-03:00").toISOString();
      const u = new Date(until + "T23:59:59-03:00").toISOString();
      const { data, count } = await db
        .from("lead_session")
        .select("has_purchase, has_whatsapp", { count: "exact" })
        .eq("tenant_id", tenantId)
        .gte("started_at", s)
        .lte("started_at", u);
      const withPurchase = (data ?? []).filter((r) => r.has_purchase).length;
      const withWa = (data ?? []).filter((r) => r.has_whatsapp).length;
      return `Período ${since} a ${until}: ${count ?? 0} sessões, ${withPurchase} com compra, ${withWa} com WhatsApp.`;
    }
    case "get_crm_summary": {
      const { data } = await db.from("lead").select("stage, temperature, name, phone, tracking_code").eq("tenant_id", tenantId).not("stage", "is", null).limit(1000);
      const rows = data ?? [];
      if (rows.length === 0) return "Nenhum lead qualificado ainda (sem estágio no CRM).";
      const byStage: Record<string, number> = {};
      const byTemp: Record<string, number> = {};
      for (const r of rows) {
        byStage[String(r.stage)] = (byStage[String(r.stage)] ?? 0) + 1;
        if (r.temperature) byTemp[String(r.temperature)] = (byTemp[String(r.temperature)] ?? 0) + 1;
      }
      const hot = rows
        .filter((r) => r.temperature === "quente")
        .slice(0, 10)
        .map((r) => `- ${r.name ?? r.phone ?? r.tracking_code} (${r.stage})`);
      return [
        `Funil: ${Object.entries(byStage).map(([k, v]) => `${k}=${v}`).join(", ")}`,
        `Temperatura: ${Object.entries(byTemp).map(([k, v]) => `${k}=${v}`).join(", ")}`,
        hot.length ? `Leads quentes:\n${hot.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "get_integration_status": {
      const { data: integs } = await db.from("integration").select("provider, status").eq("tenant_id", tenantId);
      const { data: wa } = await db.from("whatsapp_instance").select("status").eq("tenant_id", tenantId).maybeSingle();
      const lines = (integs ?? []).map((i) => `${i.provider}: ${i.status}`);
      lines.push(`whatsapp: ${wa?.status ?? "não conectado"}`);
      return lines.join("\n");
    }
    default:
      return `Ferramenta desconhecida: ${name}`;
  }
}
