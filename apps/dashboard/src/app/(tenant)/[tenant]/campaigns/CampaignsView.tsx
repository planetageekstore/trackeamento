"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TrendChart, type Series } from "@/components/TrendChart";
import { BarChart } from "@/components/BarChart";
import { pausarObjeto, pausarEmMassa } from "./actions";

export interface Row {
  level: "campaign" | "adset" | "ad";
  id: string;
  name: string;
  parent: string; // objetivo (campanha) ou campanha pai (conjunto/anúncio)
  adset?: string;
  thumbnail?: string | null;
  status: string;
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
  cpa: number;
}

const money = (n: number) => `R$ ${n.toFixed(2)}`;
const int = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${n.toFixed(2)}%`;

type Col = { key: string; label: string; get: (r: Row) => number | string; num: boolean; fmt: (r: Row) => string };

const COLS: Col[] = [
  { key: "spend", label: "Invest.", get: (r) => r.spend, num: true, fmt: (r) => money(r.spend) },
  { key: "impressions", label: "Impr.", get: (r) => r.impressions, num: true, fmt: (r) => int(r.impressions) },
  { key: "frequency", label: "Freq.", get: (r) => r.frequency, num: true, fmt: (r) => r.frequency.toFixed(2) },
  { key: "clicks", label: "Cliques", get: (r) => r.clicks, num: true, fmt: (r) => int(r.clicks) },
  { key: "ctr", label: "CTR", get: (r) => r.ctr, num: true, fmt: (r) => pct(r.ctr) },
  { key: "cpc", label: "CPC", get: (r) => r.cpc, num: true, fmt: (r) => money(r.cpc) },
  { key: "cpa", label: "CPA", get: (r) => r.cpa, num: true, fmt: (r) => (r.results > 0 ? money(r.cpa) : "—") },
  { key: "results", label: "Leads", get: (r) => r.results, num: true, fmt: (r) => (r.results ? int(r.results) : "—") },
  { key: "roas", label: "ROAS", get: (r) => r.roas, num: true, fmt: (r) => (r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—") },
];

// Métrica do gráfico (bar + line quando diária).
const CHART_METRICS: { key: string; label: string; daily: boolean; get: (r: Row) => number; prefix?: string }[] = [
  { key: "spend", label: "Investimento", daily: true, get: (r) => r.spend, prefix: "R$ " },
  { key: "clicks", label: "Cliques", daily: true, get: (r) => r.clicks },
  { key: "impressions", label: "Impressões", daily: true, get: (r) => r.impressions },
  { key: "results", label: "Leads/Result.", daily: false, get: (r) => r.results },
  { key: "cpa", label: "CPA", daily: false, get: (r) => r.cpa, prefix: "R$ " },
  { key: "ctr", label: "CTR", daily: false, get: (r) => r.ctr },
  { key: "roas", label: "ROAS", daily: false, get: (r) => r.roas },
];

const CARD_METRICS: { key: string; label: string; fmt: (t: Totals) => string }[] = [
  { key: "spend", label: "Investimento", fmt: (t) => money(t.spend) },
  { key: "impressions", label: "Impressões", fmt: (t) => int(t.impressions) },
  { key: "frequency", label: "Frequência", fmt: (t) => t.frequency.toFixed(2) },
  { key: "clicks", label: "Cliques", fmt: (t) => int(t.clicks) },
  { key: "ctr", label: "CTR", fmt: (t) => pct(t.ctr) },
  { key: "cpc", label: "CPC", fmt: (t) => money(t.cpc) },
  { key: "cpa", label: "CPA", fmt: (t) => (t.results ? money(t.spend / t.results) : "—") },
  { key: "results", label: "Leads/Result.", fmt: (t) => int(t.results) },
  { key: "reach", label: "Alcance", fmt: (t) => int(t.reach) },
  { key: "roas", label: "ROAS", fmt: (t) => (t.roas ? `${t.roas.toFixed(2)}x` : "—") },
];

interface Totals {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  results: number;
  revenue: number;
  frequency: number;
  ctr: number;
  cpc: number;
  roas: number;
}

function totalsOf(rows: Row[]): Totals {
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const reach = rows.reduce((s, r) => s + r.reach, 0);
  const results = rows.reduce((s, r) => s + r.results, 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const frequency = rows.length ? rows.reduce((s, r) => s + r.frequency, 0) / rows.length : 0;
  return {
    spend,
    impressions,
    clicks,
    reach,
    results,
    revenue,
    frequency,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    cpc: clicks ? spend / clicks : 0,
    roas: spend ? revenue / spend : 0,
  };
}

/** Linha de tendência (mínimos quadrados) sobre uma série. */
function trendLine(values: number[]): number[] {
  const n = values.length;
  if (n < 2) return values;
  const xs = values.map((_, i) => i);
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = values.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((a, x, i) => a + x * values[i]!, 0);
  const sxx = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return values;
  const b = (n * sxy - sx * sy) / denom;
  const a = (sy - b * sx) / n;
  return xs.map((x) => Math.max(0, a + b * x));
}

function StatusTag({ status }: { status: string }) {
  const active = status === "ACTIVE";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
      {status || "—"}
    </span>
  );
}

export function CampaignsView({
  tenant,
  campaigns,
  adsets,
  ads,
  dailyLabels,
  daily,
}: {
  tenant: string;
  campaigns: Row[];
  adsets: Row[];
  ads: Row[];
  dailyLabels: string[];
  daily: { spend: number[]; clicks: number[]; impressions: number[] };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"campaign" | "adset" | "ad">("campaign");
  const [metric, setMetric] = useState("spend");
  const [sortCol, setSortCol] = useState("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<"active" | "paused" | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const rowsByTab = { campaign: campaigns, adset: adsets, ad: ads };
  const allRows = rowsByTab[tab];

  const rows = useMemo(() => {
    let r = allRows;
    if (statusFilter === "active") r = r.filter((x) => x.status === "ACTIVE");
    else if (statusFilter === "paused") r = r.filter((x) => x.status !== "ACTIVE");
    const col = COLS.find((c) => c.key === sortCol);
    const sorted = [...r].sort((a, b) => {
      const va = col ? col.get(a) : a.spend;
      const vb = col ? col.get(b) : b.spend;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [allRows, statusFilter, sortCol, sortDir]);

  const totals = useMemo(() => totalsOf(campaigns), [campaigns]);
  const chartMeta = CHART_METRICS.find((m) => m.key === metric) ?? CHART_METRICS[0]!;

  // Line chart: métrica diária quando disponível, senão investimento.
  const lineKey = chartMeta.daily ? (metric as "spend" | "clicks" | "impressions") : "spend";
  const lineVals = daily[lineKey];
  const lineSeries: Series[] = [
    { name: chartMeta.daily ? chartMeta.label : "Investimento", color: "#16a34a", values: lineVals },
    { name: "Tendência", color: "#9ca3af", values: trendLine(lineVals), dashed: true },
  ];
  const linePrefix = lineKey === "spend" ? "R$ " : "";

  // Bar chart: comparativo por objeto do nível ativo (top 12 pela métrica).
  const barRows = [...rows].sort((a, b) => chartMeta.get(b) - chartMeta.get(a)).slice(0, 12);
  const bars = barRows.map((r) => ({ label: r.name, value: chartMeta.get(r) }));

  function toggleSort(key: string) {
    if (sortCol === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(key);
      setSortDir("desc");
    }
  }

  function toggleSel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function doPause(row: Row, action: "pause" | "activate") {
    const verb = action === "pause" ? "Pausar" : "Reativar";
    if (!confirm(`${verb} "${row.name}"? A veiculação muda imediatamente na Meta.`)) return;
    setBusy(true);
    setMsg(null);
    const res = await pausarObjeto({
      tenantId: tenant,
      objectType: row.level,
      objectId: row.id,
      objectName: row.name,
      action,
    });
    setBusy(false);
    if (res.ok) {
      setMsg(`${verb} aplicado.`);
      router.refresh();
    } else {
      setMsg(`Erro: ${res.error}`);
    }
  }

  async function doBulk(action: "pause" | "activate") {
    const objs = rows.filter((r) => selected.has(r.id));
    if (objs.length === 0) return;
    const verb = action === "pause" ? "Pausar" : "Reativar";
    if (!confirm(`${verb} ${objs.length} item(ns) selecionado(s) na Meta?`)) return;
    setBusy(true);
    setMsg(null);
    const res = await pausarEmMassa(
      tenant,
      action,
      objs.map((r) => ({ objectType: r.level, objectId: r.id, objectName: r.name })),
    );
    setBusy(false);
    setSelected(new Set());
    setMsg(`${res.done} aplicado(s)${res.failed.length ? `, ${res.failed.length} falha(s)` : ""}.`);
    router.refresh();
  }

  function exportCsv() {
    const header = ["nivel", "nome", "campanha", tab === "ad" ? "conjunto" : "", "status", ...COLS.map((c) => c.label)].filter(
      Boolean,
    );
    const lines = rows.map((r) =>
      [
        r.level,
        r.name,
        r.parent,
        tab === "ad" ? (r.adset ?? "") : "",
        r.status,
        ...COLS.map((c) => String(c.get(r))),
      ]
        .filter((_, i) => i !== 3 || tab === "ad")
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campanhas_${tab}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sortArrow = (key: string) => (sortCol === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div className="space-y-6">
      {/* Cards de métricas (totais da conta) */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        {CARD_METRICS.map((c) => (
          <div key={c.key} className="rounded-xl border bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-400">{c.label}</p>
            <p className="mt-1 text-xl font-semibold">{c.fmt(totals)}</p>
          </div>
        ))}
      </section>

      {/* Controles do gráfico */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="mr-2 text-xs uppercase tracking-wide text-neutral-400">Métrica do gráfico</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm">
            {CHART_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => router.refresh()} className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">
            ↻ Atualizar
          </button>
          <button onClick={exportCsv} className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Dashboards */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 text-sm font-medium text-neutral-700">
            Evolução no tempo — {chartMeta.daily ? chartMeta.label : "Investimento"}
          </h2>
          <TrendChart labels={dailyLabels} series={lineSeries} prefix={linePrefix} title="Evolução no tempo" />
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 text-sm font-medium text-neutral-700">Comparativo — {chartMeta.label}</h2>
          {bars.length > 0 ? (
            <BarChart bars={bars} prefix={chartMeta.prefix ?? ""} />
          ) : (
            <p className="text-sm text-neutral-400">Sem dados no período.</p>
          )}
        </div>
      </section>

      {/* Abas de nível */}
      <div className="flex items-center gap-1 border-b">
        {(
          [
            ["campaign", "Campanhas"],
            ["adset", "Conjuntos de anúncios"],
            ["ad", "Anúncios"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setTab(key);
              setSelected(new Set());
            }}
            className={`border-b-2 px-4 py-2 text-sm ${
              tab === key ? "border-emerald-500 font-medium text-emerald-700" : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-1">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "active" | "paused" | "all")}
            className="rounded-lg border px-2 py-1 text-xs"
          >
            <option value="all">Todas</option>
            <option value="active">Somente ativas</option>
            <option value="paused">Pausadas</option>
          </select>
        </div>
      </div>

      {/* Barra de ações em massa */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
          <span>{selected.size} selecionado(s)</span>
          <button onClick={() => doBulk("pause")} disabled={busy} className="rounded-md bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-50">
            ⏸ Pausar
          </button>
          <button onClick={() => doBulk("activate")} disabled={busy} className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-50">
            ▶ Reativar
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-neutral-500 hover:underline">
            limpar
          </button>
        </div>
      )}
      {msg && <p className="text-sm text-neutral-600">{msg}</p>}

      {/* Tabela detalhada */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-neutral-500">
              <th className="w-8 py-2">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </th>
              <th className="py-2">{tab === "ad" ? "Anúncio" : tab === "adset" ? "Conjunto" : "Campanha"}</th>
              <th>{tab === "campaign" ? "Objetivo" : "Campanha"}</th>
              <th>Status</th>
              {COLS.map((c) => (
                <th key={c.key} className="cursor-pointer select-none text-right hover:text-neutral-800" onClick={() => toggleSort(c.key)}>
                  {c.label}
                  {sortArrow(c.key)}
                </th>
              ))}
              <th className="text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b align-middle">
                <td className="py-2">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} />
                </td>
                <td className="py-2 pr-2">
                  <span className="flex items-center gap-2">
                    {r.thumbnail && <img src={r.thumbnail} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />}
                    <span className="font-medium">{r.name}</span>
                  </span>
                  {tab === "ad" && r.adset && <span className="block text-[11px] text-neutral-400">{r.adset}</span>}
                </td>
                <td className="pr-2 text-neutral-500">{r.parent}</td>
                <td>
                  <StatusTag status={r.status} />
                </td>
                {COLS.map((c) => (
                  <td key={c.key} className="text-right tabular-nums">
                    {c.fmt(r)}
                  </td>
                ))}
                <td className="text-right">
                  {r.status === "ACTIVE" ? (
                    <button onClick={() => doPause(r, "pause")} disabled={busy} className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
                      ⏸ Pausar
                    </button>
                  ) : (
                    <button onClick={() => doPause(r, "activate")} disabled={busy} className="rounded-md border border-emerald-200 px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">
                      ▶ Ativar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 5} className="py-6 text-center text-neutral-500">
                  Nenhum item nesse nível/filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
