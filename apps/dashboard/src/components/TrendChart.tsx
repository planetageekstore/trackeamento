"use client";

import { useEffect, useRef, useState } from "react";

export interface Series {
  name: string;
  color: string;
  values: number[];
  /** Linha tracejada (ex.: linha de tendência). */
  dashed?: boolean;
}

interface Props {
  labels: string[];
  series: Series[];
  height?: number;
  prefix?: string;
  /** Título usado no modo tela cheia (botão expandir). */
  title?: string;
}

/**
 * Gráfico de linhas multi-série em SVG (sem libs). Renderiza em pixels reais
 * medindo a largura do container (ResizeObserver), então as fontes NÃO encolhem
 * como acontecia com viewBox fixo. Tooltip por hover/toque, pontos nos dados e
 * botão para expandir em tela cheia.
 */
export function TrendChart(props: Props) {
  const { title } = props;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Expandir gráfico"
        title="Expandir"
        className="absolute right-0 top-0 z-10 rounded-md border bg-white/80 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
      >
        ⤢
      </button>
      <Chart {...props} />

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">{title ?? "Gráfico"}</h3>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100"
              >
                ✕ Fechar
              </button>
            </div>
            <Chart {...props} height={Math.max(props.height ?? 300, 460)} />
          </div>
        </div>
      )}
    </div>
  );
}

function useContainerWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function Chart({ labels, series, height = 300, prefix = "" }: Props) {
  const [ref, W] = useContainerWidth();
  const [hover, setHover] = useState<number | null>(null);

  const H = height;
  const pad = { l: 56, r: 16, t: 16, b: 32 };
  const n = labels.length;
  const allVals = series.flatMap((s) => s.values);
  const max = Math.max(1, ...allVals);
  const iw = Math.max(0, W - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: max * f, yy: y(max * f) }));
  const fmt = (v: number) =>
    prefix + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v % 1 === 0 ? String(v) : v.toFixed(0));
  const fmtFull = (v: number) =>
    prefix + (v % 1 === 0 ? v.toLocaleString("pt-BR") : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const step = Math.max(1, Math.ceil(n / 8));
  const showDots = n > 0 && n <= 31;

  const onMove = (clientX: number, rect: DOMRect) => {
    if (n === 0 || iw <= 0) return;
    const px = clientX - rect.left;
    const rel = (px - pad.l) / iw;
    const i = Math.round(rel * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div ref={ref} className="w-full">
      <div className="relative w-full" style={{ height: H }}>
      {W > 0 && (
        <svg
          width={W}
          height={H}
          role="img"
          onMouseMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHover(null)}
          onTouchStart={(e) =>
            e.touches[0] && onMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())
          }
          onTouchMove={(e) =>
            e.touches[0] && onMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())
          }
        >
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} y1={t.yy} x2={W - pad.r} y2={t.yy} stroke="#eee" />
              <text x={pad.l - 8} y={t.yy + 4} textAnchor="end" fontSize="12" fill="#999">
                {fmt(t.v)}
              </text>
            </g>
          ))}

          {labels.map((lb, i) =>
            i % step === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="12" fill="#999">
                {lb.slice(5)}
              </text>
            ) : null,
          )}

          {hover != null && (
            <line x1={x(hover)} y1={pad.t} x2={x(hover)} y2={pad.t + ih} stroke="#cbd5e1" strokeDasharray="3 3" />
          )}

          {series.map((s) => (
            <polyline
              key={s.name}
              fill="none"
              stroke={s.color}
              strokeWidth={s.dashed ? 1.5 : 2.5}
              strokeDasharray={s.dashed ? "6 5" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            />
          ))}

          {showDots &&
            series.filter((s) => !s.dashed).map((s) =>
              s.values.map((v, i) => (
                <circle
                  key={`${s.name}-${i}`}
                  cx={x(i)}
                  cy={y(v)}
                  r={hover === i ? 4.5 : 2.5}
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth="1"
                />
              )),
            )}
        </svg>
      )}

      {hover != null && W > 0 && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border bg-white px-3 py-2 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(x(hover) + 8, 8), W - 160),
            top: pad.t,
          }}
        >
          <p className="mb-1 font-medium text-neutral-700">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center justify-between gap-3 text-neutral-600">
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="font-medium tabular-nums">{fmtFull(s.values[hover] ?? 0)}</span>
            </p>
          ))}
        </div>
      )}
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-600">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1">
            <i className="inline-block h-2 w-3 rounded" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
