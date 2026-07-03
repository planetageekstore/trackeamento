// heatmap.ts — coleta de calor agregada e LEVE (US extra).
// Nada é enviado a cada movimento: amostramos ~8x/s, acumulamos em uma grade
// na MEMÓRIA do navegador e mandamos UM resumo por visita (ou a cada 20s).
// Anônimo: não há TRK aqui, apenas o caminho da página.

import { getSiteKey, getApiBase } from "./loader";

// Precisam bater com o renderizador do dashboard.
export const COLS = 50; // largura dividida em 50 colunas relativas
export const ROW_H = 24; // altura da linha (px absolutos do topo do documento)
const SAMPLE_MS = 120; // ~8 amostras/segundo no máximo
const FLUSH_MS = 20000; // envio periódico em sessões longas

type Grid = Map<string, number>;

export function initHeatmap(): void {
  try {
    const siteKey = getSiteKey();
    if (!siteKey) return;
    const apiBase = getApiBase();

    const moves: Grid = new Map();
    const clicks: Grid = new Map();
    let lastSample = 0;

    const cellKey = (clientX: number, docY: number): string => {
      const w = Math.max(document.documentElement.clientWidth, 1);
      const col = Math.min(COLS - 1, Math.max(0, Math.floor((clientX / w) * COLS)));
      const row = Math.max(0, Math.floor(docY / ROW_H));
      return `${col},${row}`;
    };

    const onMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastSample < SAMPLE_MS) return; // amostragem
      lastSample = now;
      const k = cellKey(e.clientX, e.clientY + window.scrollY);
      moves.set(k, (moves.get(k) ?? 0) + 1);
    };

    const onClick = (e: MouseEvent) => {
      const k = cellKey(e.clientX, e.clientY + window.scrollY);
      clicks.set(k, (clicks.get(k) ?? 0) + 1);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("click", onClick, { passive: true, capture: true });

    const toArr = (g: Grid): [number, number, number][] =>
      Array.from(g, ([k, v]) => {
        const [x, y] = k.split(",");
        return [Number(x), Number(y), v];
      });

    const flush = (useBeacon: boolean) => {
      if (moves.size === 0 && clicks.size === 0) return;
      const payload = {
        sk: siteKey,
        page: location.pathname,
        w: document.documentElement.clientWidth,
        h: document.documentElement.scrollHeight,
        moves: toArr(moves),
        clicks: toArr(clicks),
      };
      moves.clear();
      clicks.clear();
      const url = `${apiBase}/api/heatmap`;
      const body = JSON.stringify(payload);
      try {
        if (useBeacon && typeof navigator.sendBeacon === "function") {
          navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
          return;
        }
        void fetch(url, {
          method: "POST",
          body,
          headers: { "content-type": "application/json" },
          keepalive: true,
          mode: "cors",
          credentials: "omit",
        }).catch(() => {
          /* silencioso */
        });
      } catch {
        /* silencioso */
      }
    };

    const interval = window.setInterval(() => flush(false), FLUSH_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush(true);
    });
    window.addEventListener("pagehide", () => {
      window.clearInterval(interval);
      flush(true);
    });
  } catch {
    /* silencioso por design (FR-006) */
  }
}
