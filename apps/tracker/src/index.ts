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
  } catch {
    /* silencioso por design (FR-006 / Princípio III) */
  }
})();

export {};
