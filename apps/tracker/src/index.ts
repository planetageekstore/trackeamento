// tracker.js — orquestrador first-party (US1).
// Gera/reusa o RG (TRK), captura a origem, persiste local e emite PAGE_VIEW.
// Toda a lógica é resiliente: nunca quebra o site do cliente (FR-006).

import { generateTrackingCode } from "@trk/shared/trk";
import { parseOrigin } from "./parseUrl";
import { getStoredId, storeId, storeOrigin } from "./storage";
import { getSiteKey, getApiBase } from "./loader";
import { sendEvent, type BrowserEventType } from "./api";
import { interceptWhatsApp } from "./whatsapp";
import { isCheckoutPage } from "./checkout";
import { initHeatmap } from "./heatmap";

declare global {
  interface Window {
    _saasTrk?: {
      getId(): string | null;
      track(type: BrowserEventType, data?: Record<string, unknown>): void;
    };
  }
}

(function () {
  try {
    const siteKey = getSiteKey();
    if (!siteKey) return; // sem site key não há como identificar o tenant

    const apiBase = getApiBase();
    const origin = parseOrigin();

    // Reutiliza o TRK existente ou gera um novo no cliente (FR-001/FR-005/FR-007).
    let id = getStoredId();
    if (!id) {
      id = generateTrackingCode();
      storeId(id);
      storeOrigin(origin); // guarda a PRIMEIRA origem
    }

    // PAGE_VIEW assíncrono; envia a origem sempre — o servidor decide se há um
    // novo toque (click) a registrar (FR-023: nenhum toque descartado).
    sendEvent(apiBase, siteKey, id, "PAGE_VIEW", { origin });

    // CHECKOUT quando o visitante entra numa página de checkout (FR-022).
    if (isCheckoutPage()) sendEvent(apiBase, siteKey, id, "CHECKOUT");

    // API global para checkout/e-commerce e eventos custom (FR-009).
    window._saasTrk = {
      getId: () => getStoredId(),
      track: (type, data) => {
        const cur = getStoredId();
        if (cur) sendEvent(apiBase, siteKey, cur, type, { data });
      },
    };

    // Intercepta botões de WhatsApp: anexa o marcador e emite WHATSAPP_CLICK (US2).
    interceptWhatsApp(id, () => {
      const cur = getStoredId();
      if (cur) sendEvent(apiBase, siteKey, cur, "WHATSAPP_CLICK");
    });

    // Rastreia navegação em SPA (History API): cada troca de rota emite um novo
    // PAGE_VIEW com a URL atual, sem depender de reload (FR-022). Sites clássicos
    // recarregam a página e re-executam este script, então não precisam disto.
    let lastUrl = window.location.href;
    const onRouteChange = () => {
      try {
        const href = window.location.href;
        if (href === lastUrl) return; // evita duplicar a mesma rota
        lastUrl = href;
        const cur = getStoredId();
        if (cur) sendEvent(apiBase, siteKey, cur, "PAGE_VIEW", { origin: parseOrigin() });
      } catch {
        /* silencioso */
      }
    };
    const hist = window.history;
    for (const m of ["pushState", "replaceState"] as const) {
      const orig = hist[m];
      hist[m] = function (this: History, ...args: Parameters<History["pushState"]>) {
        const r = orig.apply(this, args);
        onRouteChange();
        return r;
      };
    }
    window.addEventListener("popstate", onRouteChange);

    // Mapa de calor: coleta agregada e leve de movimento/click (1 envio por visita).
    initHeatmap();
  } catch {
    /* silencioso por design (FR-006 / Princípio III) */
  }
})();

export {};
