"use client";

export interface Series {
  name: string;
  color: string;
  values: number[];
}

/**
 * Gráfico de linhas multi-série em SVG (sem libs). Eixo X = labels (datas),
 * eixo Y automático. Responsivo via viewBox.
 */
export function TrendChart({
  labels,
  series,
  height = 220,
  prefix = "",
}: {
  labels: string[];
  series: Series[];
  height?: number;
  prefix?: string;
}) {
  const W = 760;
  const H = height;
  const pad = { l: 48, r: 12, t: 12, b: 24 };
  const n = labels.length;
  const allVals = series.flatMap((s) => s.values);
  const max = Math.max(1, ...allVals);
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  // 4 linhas de grade + rótulos do eixo Y
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: max * f, yy: y(max * f) }));
  const fmt = (v: number) =>
    prefix + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v % 1 === 0 ? String(v) : v.toFixed(0));
  // mostra ~6 rótulos no eixo X
  const step = Math.max(1, Math.ceil(n / 6));

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} y1={t.yy} x2={W - pad.r} y2={t.yy} stroke="#eee" />
            <text x={pad.l - 6} y={t.yy + 3} textAnchor="end" fontSize="9" fill="#999">
              {fmt(t.v)}
            </text>
          </g>
        ))}
        {labels.map((lb, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#999">
              {lb.slice(5)}
            </text>
          ) : null,
        )}
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-neutral-600">
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
