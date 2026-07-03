"use client";

import { useMemo } from "react";

const ROW_H = 24; // precisa bater com o tracker

export interface ScrollBucket {
  row: number; // profundidade (px/24 do topo)
  count: number; // visitantes cuja rolagem PAROU nesse nível
}

/**
 * Mapa de rolagem estilo Hotjar: para cada faixa vertical, mostra a % de
 * visitantes que chegou a vê-la. Todo mundo vê o topo (100%); a cor esfria
 * conforme menos gente desce. Sobrepõe um screenshot opcional da página.
 */
export function ScrollMap({
  buckets,
  pageWidth,
  pageHeight,
  bg,
}: {
  buckets: ScrollBucket[];
  pageWidth: number;
  pageHeight: number;
  bg?: string | null;
}) {
  const { total, reachPct, maxRow } = useMemo(() => {
    const total = buckets.reduce((s, b) => s + b.count, 0);
    const maxRow = Math.max(pageHeight > 0 ? Math.ceil(pageHeight / ROW_H) : 0, ...buckets.map((b) => b.row), 1);
    // Sufixo: quantos alcançaram a linha r OU mais funda.
    const suffix = new Array<number>(maxRow + 2).fill(0);
    const counts = new Array<number>(maxRow + 2).fill(0);
    for (const b of buckets) if (b.row >= 0 && b.row <= maxRow) counts[b.row]! += b.count;
    for (let r = maxRow; r >= 0; r--) suffix[r] = suffix[r + 1]! + counts[r]!;
    const reachPct = (r: number) => (total > 0 ? (suffix[r]! / total) * 100 : 0);
    return { total, reachPct, maxRow };
  }, [buckets, pageHeight]);

  // Cor da faixa por % de alcance (quente = mais gente).
  const colorFor = (pct: number): string => {
    if (pct >= 75) return "rgba(220,38,38,0.55)"; // vermelho
    if (pct >= 50) return "rgba(234,179,8,0.5)"; // amarelo
    if (pct >= 25) return "rgba(132,204,22,0.45)"; // verde
    if (pct > 0) return "rgba(59,130,246,0.4)"; // azul
    return "rgba(30,58,138,0.35)"; // azul escuro (quase ninguém)
  };

  const W = Math.min(pageWidth || 1000, 1200) || 1000;
  const scale = pageWidth > 0 ? W / pageWidth : 1;
  const H = Math.max((pageHeight || (maxRow + 2) * ROW_H) * scale, 400);

  // Linhas de referência para 75/50/25% (a "dobra" onde perde gente).
  const marks = [90, 75, 50, 25].map((pct) => {
    let row = 0;
    for (let r = 0; r <= maxRow; r++) {
      if (reachPct(r) >= pct) row = r;
      else break;
    }
    return { pct, top: row * ROW_H * scale };
  });

  const bandStep = 6; // agrupa 6 linhas (~144px) por faixa desenhada
  const bands: { top: number; height: number; color: string }[] = [];
  for (let r = 0; r <= maxRow; r += bandStep) {
    bands.push({
      top: r * ROW_H * scale,
      height: bandStep * ROW_H * scale,
      color: colorFor(reachPct(r)),
    });
  }

  if (total === 0) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm text-neutral-500">
        Sem dados de rolagem nesta página ainda.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        <span>{total} visitas</span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded" style={{ background: "rgba(220,38,38,0.7)" }} /> ≥75%
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded" style={{ background: "rgba(234,179,8,0.7)" }} /> 50–75%
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded" style={{ background: "rgba(132,204,22,0.7)" }} /> 25–50%
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded" style={{ background: "rgba(59,130,246,0.7)" }} /> &lt;25%
        </span>
      </div>

      <div
        className="relative w-full overflow-hidden rounded-lg border bg-neutral-100"
        style={{ aspectRatio: bg ? undefined : `${W} / ${H}` }}
      >
        {bg ? <img src={bg} alt="" className="block w-full select-none" /> : null}
        <div className="absolute inset-0">
          {bands.map((b, i) => (
            <div
              key={i}
              className="absolute left-0 w-full"
              style={{ top: `${(b.top / H) * 100}%`, height: `${(b.height / H) * 100}%`, background: b.color }}
            />
          ))}
          {marks.map((m) => (
            <div
              key={m.pct}
              className="absolute left-0 flex w-full items-center"
              style={{ top: `${(m.top / H) * 100}%` }}
            >
              <div className="h-px w-full bg-black/40" />
              <span className="absolute right-1 -translate-y-1/2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                {m.pct}% chegam aqui
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
