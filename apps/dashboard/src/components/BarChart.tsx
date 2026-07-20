"use client";

import { useEffect, useRef, useState } from "react";

export interface Bar {
  label: string;
  value: number;
  color?: string;
}

const PALETTE = ["#16a34a", "#2563eb", "#ea580c", "#0891b2", "#db2777", "#7c3aed", "#ca8a04", "#0d9488"];

/**
 * Gráfico de barras verticais em SVG (sem libs), com tooltip por hover.
 * Renderiza em pixels reais medindo a largura do container.
 */
export function BarChart({ bars, height = 300, prefix = "" }: { bars: Bar[]; height?: number; prefix?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [W, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => {
      const w = e[0]?.contentRect.width ?? 0;
      if (w > 0) setW(w);
    });
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const H = height;
  const pad = { l: 56, r: 12, t: 12, b: 64 };
  const n = bars.length;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const iw = Math.max(0, W - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const bw = n > 0 ? (iw / n) * 0.62 : 0;
  const gap = n > 0 ? iw / n : 0;
  const x = (i: number) => pad.l + gap * i + (gap - bw) / 2;
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  const ticks = [0, 0.5, 1].map((f) => ({ v: max * f, yy: y(max * f) }));
  const fmt = (v: number) => prefix + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(v % 1 === 0 ? 0 : 2));

  return (
    <div ref={ref} className="w-full" style={{ minHeight: H }}>
      {W > 0 && (
        <svg width={W} height={H} role="img">
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} y1={t.yy} x2={W - pad.r} y2={t.yy} stroke="#eee" />
              <text x={pad.l - 8} y={t.yy + 4} textAnchor="end" fontSize="12" fill="#999">
                {fmt(t.v)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const bx = x(i);
            const by = y(b.value);
            const color = b.color ?? PALETTE[i % PALETTE.length];
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={bx} y={by} width={bw} height={Math.max(0, pad.t + ih - by)} rx="3" fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />
                <text
                  x={bx + bw / 2}
                  y={H - pad.b + 14}
                  textAnchor="end"
                  fontSize="11"
                  fill="#777"
                  transform={`rotate(-35 ${bx + bw / 2} ${H - pad.b + 14})`}
                >
                  {b.label.length > 22 ? b.label.slice(0, 22) + "…" : b.label}
                </text>
                {hover === i && (
                  <text x={bx + bw / 2} y={by - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill="#333">
                    {fmt(b.value)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
