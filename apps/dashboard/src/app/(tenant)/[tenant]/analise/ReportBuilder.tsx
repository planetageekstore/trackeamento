"use client";

import { useState } from "react";
import { gerarRelatorio, regenerarSecao, salvarRelatorio, type ReportResult } from "./actions";

const BLOCKS = [
  { key: "analise", emoji: "📊", title: "Análise do período" },
  { key: "positivo", emoji: "✅", title: "Ponto positivo" },
  { key: "melhoria", emoji: "⚠️", title: "Pontos de melhoria" },
  { key: "proximos", emoji: "🎯", title: "Próximos passos" },
];

const money = (n: number) => `R$ ${n.toFixed(2)}`;
const int = (n: number) => n.toLocaleString("pt-BR");

// Catálogo de métricas: key, rótulo, grupo e como formatar a partir de totals.
const METRICS: { key: string; label: string; group: "meta" | "res"; fmt: (t: ReportResult["metrics"]["totals"]) => string }[] = [
  { key: "investimento", label: "Investimento", group: "meta", fmt: (t) => money(t.spend) },
  { key: "impressoes", label: "Impressões", group: "meta", fmt: (t) => int(t.impressions) },
  { key: "cliques", label: "Cliques", group: "meta", fmt: (t) => int(t.clicks) },
  { key: "ctr", label: "CTR", group: "meta", fmt: (t) => `${t.ctr.toFixed(2)}%` },
  { key: "cpc", label: "CPC", group: "meta", fmt: (t) => money(t.cpc) },
  { key: "cpm", label: "CPM", group: "meta", fmt: (t) => money(t.cpm) },
  { key: "alcance", label: "Alcance", group: "meta", fmt: (t) => int(t.reach) },
  { key: "frequencia", label: "Frequência", group: "meta", fmt: (t) => t.frequency.toFixed(2) },
  { key: "leads", label: "Leads", group: "res", fmt: (t) => int(t.leads) },
  { key: "cpl", label: "CPL", group: "res", fmt: (t) => money(t.cpl) },
  { key: "conversas", label: "Conversas iniciadas", group: "res", fmt: (t) => int(t.conversas) },
  { key: "custo_conversa", label: "Custo por conversa", group: "res", fmt: (t) => money(t.custoConversa) },
  { key: "compras", label: "Compras", group: "res", fmt: (t) => int(t.purchases) },
  { key: "receita", label: "Receita", group: "res", fmt: (t) => money(t.revenue) },
  { key: "roas", label: "ROAS", group: "res", fmt: (t) => t.roas.toFixed(2) },
];

const ALL_KEYS = METRICS.map((m) => m.key);

export function ReportBuilder({
  tenant,
  defaultSince,
  defaultUntil,
}: {
  tenant: string;
  defaultSince: string;
  defaultUntil: string;
}) {
  const [since, setSince] = useState(defaultSince);
  const [until, setUntil] = useState(defaultUntil);
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_KEYS));
  const [result, setResult] = useState<ReportResult | null>(null);
  const [blocks, setBlocks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [opinion, setOpinion] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const preset = (days: number) => {
    const now = new Date();
    setUntil(now.toISOString().slice(0, 10));
    setSince(new Date(now.getTime() - (days - 1) * 864e5).toISOString().slice(0, 10));
  };

  async function onGenerate() {
    setLoading(true);
    setError(null);
    setSaveMsg(null);
    try {
      const r = await gerarRelatorio({ tenantId: tenant, since, until, selected: [...selected] });
      setResult(r);
      setBlocks(r.blocks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar relatório.");
    } finally {
      setLoading(false);
    }
  }

  async function onRegenerate(blockKey: string) {
    if (!result) return;
    setRegenerating(blockKey);
    try {
      const currentMd = BLOCKS.map((b) => `## ${b.emoji} ${b.title}\n\n${blocks[b.key] ?? ""}`).join("\n\n");
      const text = await regenerarSecao({
        tenantId: tenant,
        metrics: result.metrics,
        selected: [...selected],
        currentMd,
        blockKey,
      });
      setBlocks((prev) => ({ ...prev, [blockKey]: text }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao regenerar.");
    } finally {
      setRegenerating(null);
    }
  }

  async function onSave() {
    if (!result) return;
    setSaving(true);
    setSaveMsg(null);
    const res = await salvarRelatorio({
      tenantId: tenant,
      metrics: result.metrics,
      selected: [...selected],
      blocks,
      opinion,
      model: result.model,
    });
    setSaving(false);
    if (res.ok) {
      setSaveMsg("Relatório salvo.");
    } else {
      setSaveMsg(res.error ?? "Falha ao salvar.");
    }
  }

  const metaMetrics = METRICS.filter((m) => m.group === "meta");
  const resMetrics = METRICS.filter((m) => m.group === "res");

  return (
    <div className="space-y-6">
      {/* Período + métricas */}
      <div className="space-y-4 rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs text-neutral-500">Início</span>
            <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="rounded-lg border px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-neutral-500">Fim</span>
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="rounded-lg border px-3 py-2" />
          </label>
          <div className="flex gap-1">
            {[7, 14, 30].map((d) => (
              <button key={d} type="button" onClick={() => preset(d)} className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50">
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <MetricGroup title="Meta Ads" metrics={metaMetrics} selected={selected} toggle={toggle} />
          <MetricGroup title="Resultados" metrics={resMetrics} selected={selected} toggle={toggle} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setSelected(new Set(ALL_KEYS))}
            className="text-xs text-neutral-500 hover:underline"
          >
            Selecionar tudo
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-neutral-500 hover:underline">
            Limpar seleção
          </button>
        </div>

        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Gerando…" : "Gerar Relatório"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {result && (
        <>
          {/* Cards */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {METRICS.filter((m) => selected.has(m.key)).map((m) => (
              <div key={m.key} className="rounded-xl border bg-white p-4">
                <p className="text-xs text-neutral-500">{m.label}</p>
                <p className="mt-1 text-lg font-semibold">{m.fmt(result.metrics.totals)}</p>
              </div>
            ))}
          </section>

          {/* Seções da IA */}
          <section className="space-y-4">
            {BLOCKS.map((b) => (
              <div key={b.key} className="rounded-xl border bg-white p-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-neutral-800">
                    {b.emoji} {b.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => onRegenerate(b.key)}
                    disabled={regenerating === b.key}
                    className="rounded-md border px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {regenerating === b.key ? "Regenerando…" : "🔄 Regenerar com IA"}
                  </button>
                </div>
                <textarea
                  value={blocks[b.key] ?? ""}
                  onChange={(e) => setBlocks((prev) => ({ ...prev, [b.key]: e.target.value }))}
                  rows={5}
                  className="w-full resize-y rounded-lg border bg-neutral-50 p-3 text-sm leading-relaxed"
                />
              </div>
            ))}
          </section>

          {/* Opinião do gestor + salvar */}
          <section className="space-y-3 rounded-xl border bg-white p-5">
            <label className="block text-sm font-medium text-neutral-800">💬 Opinião do gestor</label>
            <textarea
              value={opinion}
              onChange={(e) => setOpinion(e.target.value)}
              placeholder="Sua opinião sobre o período (obrigatório para salvar)…"
              rows={3}
              className="w-full resize-y rounded-lg border p-3 text-sm"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onSave}
                disabled={saving || !opinion.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar relatório"}
              </button>
              {saveMsg && <span className="text-sm text-neutral-600">{saveMsg}</span>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetricGroup({
  title,
  metrics,
  selected,
  toggle,
}: {
  title: string;
  metrics: { key: string; label: string }[];
  selected: Set<string>;
  toggle: (key: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-neutral-400">{title}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {metrics.map((m) => (
          <label key={m.key} className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={selected.has(m.key)} onChange={() => toggle(m.key)} className="h-4 w-4" />
            {m.label}
          </label>
        ))}
      </div>
    </div>
  );
}
