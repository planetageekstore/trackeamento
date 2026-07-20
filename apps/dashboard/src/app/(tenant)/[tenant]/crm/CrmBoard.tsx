"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TrendChart, type Series } from "@/components/TrendChart";
import { moverLead, aceitarSugestaoIA } from "./actions";

export const STAGES = [
  { key: "novo", label: "Novo", color: "#64748b" },
  { key: "em_conversa", label: "Em conversa", color: "#2563eb" },
  { key: "followup", label: "Follow-up", color: "#ca8a04" },
  { key: "negociacao", label: "Negociação", color: "#7c3aed" },
  { key: "comprou", label: "Comprou", color: "#16a34a" },
  { key: "perdido", label: "Perdido", color: "#dc2626" },
] as const;

export interface CrmLead {
  id: string;
  name: string;
  phone: string | null;
  trackingCode: string;
  stage: string;
  stageSource: string;
  temperature: string | null;
  summary: string | null;
  suggestedStage: string | null;
  value: number;
}

const TEMP: Record<string, string> = { quente: "🔥", morno: "🌡", frio: "❄" };
const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));
const money = (n: number) => `R$ ${n.toFixed(2)}`;

export function CrmBoard({
  tenant,
  leads: initial,
  dayLabels,
  evolution,
}: {
  tenant: string;
  leads: CrmLead[];
  dayLabels: string[];
  evolution: { stage: string; label: string; values: number[] }[];
}) {
  const [leads, setLeads] = useState<CrmLead[]>(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [tempFilter, setTempFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (tempFilter !== "all" && l.temperature !== tempFilter) return false;
      if (q && !(l.name.toLowerCase().includes(q) || (l.phone ?? "").includes(q))) return false;
      return true;
    });
  }, [leads, tempFilter, query]);

  const byStage = useMemo(() => {
    const m: Record<string, CrmLead[]> = {};
    for (const s of STAGES) m[s.key] = [];
    for (const l of filtered) (m[l.stage] ?? (m[l.stage] = [])).push(l);
    return m;
  }, [filtered]);

  async function onDrop(stage: string) {
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage, stageSource: "manual", suggestedStage: null } : l)));
    await moverLead(tenant, id, stage);
  }

  async function acceptSuggestion(lead: CrmLead) {
    if (!lead.suggestedStage) return;
    const target = lead.suggestedStage;
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stage: target, stageSource: "ai", suggestedStage: null } : l)));
    await aceitarSugestaoIA(tenant, lead.id);
  }

  const series: Series[] = evolution.map((e) => ({
    name: e.label,
    color: STAGES.find((s) => s.key === e.stage)?.color ?? "#999",
    values: e.values,
  }));

  return (
    <div className="space-y-6">
      {/* Evolução de leads por estágio */}
      <div className="rounded-xl border bg-white p-5">
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Evolução de leads por estágio (30d)</h2>
        <TrendChart labels={dayLabels} series={series} title="Evolução de leads por estágio (30d)" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar nome ou telefone…"
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <select value={tempFilter} onChange={(e) => setTempFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          <option value="all">Todas as temperaturas</option>
          <option value="quente">🔥 Quente</option>
          <option value="morno">🌡 Morno</option>
          <option value="frio">❄ Frio</option>
        </select>
      </div>

      {/* Kanban */}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((s) => {
          const items = byStage[s.key] ?? [];
          const total = items.reduce((a, l) => a + l.value, 0);
          return (
            <div
              key={s.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(s.key)}
              className="flex min-h-[200px] flex-col rounded-xl border bg-neutral-50"
            >
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <i className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="text-xs text-neutral-400">{items.length}</span>
              </div>
              {total > 0 && <p className="px-3 pt-1 text-[11px] text-neutral-500">{money(total)}</p>}
              <div className="flex-1 space-y-2 p-2">
                {items.map((l) => (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                    className="cursor-grab rounded-lg border bg-white p-2.5 text-sm shadow-sm active:cursor-grabbing"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/${tenant}/leads/${l.id}`} className="truncate font-medium hover:underline">
                        {l.name}
                      </Link>
                      {l.temperature && <span title={l.temperature}>{TEMP[l.temperature]}</span>}
                    </div>
                    {l.summary && <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{l.summary}</p>}
                    {l.value > 0 && <p className="mt-1 text-xs font-medium text-emerald-600">{money(l.value)}</p>}
                    {l.suggestedStage && (
                      <button
                        onClick={() => acceptSuggestion(l)}
                        className="mt-1.5 w-full rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-100"
                        title="Aplicar a sugestão da IA"
                      >
                        IA sugere: {STAGE_LABEL[l.suggestedStage] ?? l.suggestedStage} — aceitar
                      </button>
                    )}
                  </div>
                ))}
                {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-neutral-300">vazio</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
