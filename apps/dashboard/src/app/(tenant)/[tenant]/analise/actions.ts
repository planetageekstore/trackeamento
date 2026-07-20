"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  gatherReportMetrics,
  generateReport,
  regenerateReportBlock,
  REPORT_BLOCKS,
  type ReportMetrics,
} from "@/server/report";

/** Garante acesso ao tenant (RLS na sessão do usuário). */
async function assertTenant(tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenant").select("id").eq("id", tenantId).maybeSingle();
  if (!data) throw new Error("Sem acesso a este cliente.");
  return supabase;
}

export interface ReportResult {
  metrics: ReportMetrics;
  outputMd: string;
  blocks: Record<string, string>;
  model: string;
}

/** Gera um relatório (não persiste — só volta pra tela). */
export async function gerarRelatorio(input: {
  tenantId: string;
  since: string;
  until: string;
  selected: string[];
}): Promise<ReportResult> {
  await requireUser();
  await assertTenant(input.tenantId);
  const metrics = await gatherReportMetrics(input.tenantId, input.since, input.until);
  const { outputMd, blocks, model } = await generateReport(metrics, input.selected);
  return { metrics, outputMd, blocks, model };
}

/** Regenera uma seção do relatório atual (não persiste). */
export async function regenerarSecao(input: {
  tenantId: string;
  metrics: ReportMetrics;
  selected: string[];
  currentMd: string;
  blockKey: string;
}): Promise<string> {
  await requireUser();
  await assertTenant(input.tenantId);
  return regenerateReportBlock(input.metrics, input.selected, input.currentMd, input.blockKey);
}

/** Salva o relatório (exige opinião do gestor). */
export async function salvarRelatorio(input: {
  tenantId: string;
  metrics: ReportMetrics;
  selected: string[];
  blocks: Record<string, string>;
  opinion: string;
  model: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  if (!input.opinion.trim()) return { ok: false, error: "A opinião do gestor é obrigatória para salvar." };
  const supabase = await assertTenant(input.tenantId);

  // Recompõe o markdown a partir dos blocos (para leitura futura).
  const outputMd = REPORT_BLOCKS.map((b) => `## ${b.emoji} ${b.title}\n\n${input.blocks[b.key] ?? ""}`).join("\n\n");

  const { error } = await supabase.from("report").insert({
    tenant_id: input.tenantId,
    period_start: input.metrics.period.since,
    period_end: input.metrics.period.until,
    metrics: { ...input.metrics, outputMd },
    selected_metrics: input.selected,
    blocks: input.blocks,
    manager_opinion: input.opinion,
    model: input.model,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/${input.tenantId}/analise`);
  return { ok: true };
}
