// tracker.js — orquestrador first-party (US1).
// Gera/reusa o RG (TRK), captura a origem, persiste local e emite PAGE_VIEW.
// Toda a lógica é resiliente: nunca quebra o site do cliente (FR-006).

import { generateTrackingCode } from "@trk/shared/trk";
import { parseOrigin } from "./parseUrl";
import { getStoredId, storeId, storeOrigin } from "./storage";
import { getSiteKey, getApiBase } from "./loader";
import { sendEvent, sendIdentify, type BrowserEventType, type Traits } from "./api";
import { interceptWhatsApp } from "./whatsapp";
import { isCheckoutPage } from "./checkout";
import { initHeatmap } from "./heatmap";

declare global {
  interface Window {
    _saasTrk?: {
      getId(): string | null;
      track(type: BrowserEventType, data?: Record<string, unknown>): void;
      identify(traits: Traits): void;
    };
    /** A loja pode preencher isto (ex.: página de confirmação) antes do tracker carregar. */
    __trkIdentify?: Traits;
  }
}

(function () {
  try {
    // Não rastreia quando a página é aberta pelo gerador de screenshot do mapa
    // de calor (thum.io etc.) — evita leads/heatmap falsos. Também ignora
    // navegadores headless óbvios (bots de renderização).
    const nav = navigator as Navigator & { webdriver?: boolean };
    if (location.search.indexOf("_trkshot") >= 0 || nav.webdriver === true) return;

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

    // Contexto do cliente para enriquecer o lead (tela/idioma/fuso). Dispositivo
    // e geo são derivados no servidor (User-Agent + IP), não aqui. `ga` é o
    // client_id do cookie _ga do GA4 (elo com a sessão web p/ o envio server-side).
    let ctx: Record<string, string> = {};
    try {
      ctx = {
        screen: `${screen.width}x${screen.height}`,
        lang: navigator.language,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      const ga = /_ga=GA\d\.\d\.(\d+\.\d+)/.exec(document.cookie);
      if (ga) ctx.ga = ga[1]!;
    } catch {
      /* silencioso */
    }

    // PAGE_VIEW assíncrono; envia a origem sempre — o servidor decide se há um
    // novo toque (click) a registrar (FR-023: nenhum toque descartado).
    sendEvent(apiBase, siteKey, id, "PAGE_VIEW", { origin, data: { ctx } });

    // CHECKOUT quando o visitante entra numa página de checkout (FR-022).
    // Dispara no MÁXIMO 1x por sessão: o tracker pode ser carregado várias vezes
    // no checkout (Partner Script + Códigos de conversão + GTM). Trava dupla:
    // flag no window (mesma página) + sessionStorage (entre páginas da sessão).
    if (isCheckoutPage()) {
      const w = window as unknown as { __trkCheckoutFired?: boolean };
      let fired = w.__trkCheckoutFired === true;
      if (!fired) {
        try {
          fired = sessionStorage.getItem("_trk_co") === "1";
        } catch {
          /* sessionStorage indisponível: cai na trava do window */
        }
      }
      if (!fired) {
        w.__trkCheckoutFired = true;
        try {
          sessionStorage.setItem("_trk_co", "1");
        } catch {
          /* ignore */
        }
        sendEvent(apiBase, siteKey, id, "CHECKOUT");
      }
    }

    // API global para checkout/e-commerce e eventos custom (FR-009).
    const identify = (traits: Traits) => {
      const cur = getStoredId();
      if (cur && traits && (traits.name || traits.email || traits.phone || traits.nsCustomer)) {
        sendIdentify(apiBase, siteKey, cur, traits);
      }
    };
    window._saasTrk = {
      getId: () => getStoredId(),
      track: (type, data) => {
        const cur = getStoredId();
        if (cur) sendEvent(apiBase, siteKey, cur, type, { data });
      },
      identify,
    };

    // Drena dados que a loja possa ter setado antes do tracker carregar
    // (ex.: página de confirmação define window.__trkIdentify com o pedido).
    if (window.__trkIdentify) identify(window.__trkIdentify);

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
