"use client";

import { useEffect, useRef } from "react";

// Precisam bater com o tracker (heatmap.ts).
const COLS = 50;
const ROW_H = 24;

export interface HeatCell {
  x: number; // coluna 0..49
  y: number; // linha (px/24 do topo)
  w: number; // peso
}

/** Paleta azul → ciano → verde → amarelo → vermelho, indexada por intensidade. */
function buildPalette(): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, "rgba(0,0,255,0)");
  grad.addColorStop(0.2, "blue");
  grad.addColorStop(0.45, "cyan");
  grad.addColorStop(0.6, "lime");
  grad.addColorStop(0.8, "yellow");
  grad.addColorStop(1.0, "red");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1, 256);
  return ctx.getImageData(0, 0, 1, 256).data;
}

/** Círculo com gradiente radial (opaco→transparente) usado como "pincel". */
function buildBrush(radius: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = radius * 2;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, radius * 2, radius * 2);
  return c;
}

export function HeatmapCanvas({
  cells,
  pageWidth,
  pageHeight,
  bg,
}: {
  cells: HeatCell[];
  pageWidth: number;
  pageHeight: number;
  bg?: string | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const W = Math.min(pageWidth || 1200, 1400) || 1200;
    const scale = pageWidth > 0 ? W / pageWidth : 1;
    const maxRow = cells.reduce((m, c) => Math.max(m, c.y), 0);
    const H = Math.max((pageHeight || (maxRow + 4) * ROW_H) * scale, 400);

    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    if (cells.length === 0) return;

    const radius = Math.max((W / COLS) * 1.6, 18);
    const brush = buildBrush(radius);
    const palette = buildPalette();
    const max = cells.reduce((m, c) => Math.max(m, c.w), 1);

    // 1) Intensidade em tons de cinza (alpha acumulado).
    for (const c of cells) {
      const px = ((c.x + 0.5) / COLS) * W;
      const py = (c.y * ROW_H + ROW_H / 2) * scale;
      ctx.globalAlpha = Math.min(Math.max(c.w / max, 0.08), 1);
      ctx.drawImage(brush, px - radius, py - radius);
    }
    ctx.globalAlpha = 1;

    // 2) Coloriza usando o alpha como índice da paleta.
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i] ?? 0;
      if (a > 0) {
        const off = a * 4;
        d[i - 3] = palette[off] ?? 0;
        d[i - 2] = palette[off + 1] ?? 0;
        d[i - 1] = palette[off + 2] ?? 0;
        // Translúcido: deixa o layout do site aparecer por baixo das manchas.
        d[i] = Math.min(Math.round(a * 0.72), bg ? 165 : 210);
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [cells, pageWidth, pageHeight, bg]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg border bg-neutral-100">
      {bg ? <img src={bg} alt="" className="block w-full select-none" /> : null}
      <canvas
        ref={ref}
        className={bg ? "absolute inset-0 h-full w-full" : "block h-auto w-full"}
      />
    </div>
  );
}
