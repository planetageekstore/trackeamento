// Descobre a configuração do tracker a partir da própria tag <script>.
// Snippet recomendado (à prova de GTM — o GTM preserva o src e seu query):
//   <script async src=".../tracker.js?k=pk_live_..."></script>
// Também aceita: data-site-key (fora do GTM) e window.__TRK_SITE_KEY__.

declare const __API_BASE__: string;

declare global {
  interface Window {
    __TRK_SITE_KEY__?: string;
    __TRK_API__?: string;
  }
}

function getScriptEl(): HTMLScriptElement | null {
  // 1) tag com data-site-key (instalação manual, fora do GTM)
  const byAttr = document.querySelector<HTMLScriptElement>("script[data-site-key]");
  if (byAttr) return byAttr;
  // 2) pelo src — o GTM recria o script e descarta data-*, mas mantém o src
  const bySrc = document.querySelector<HTMLScriptElement>('script[src*="tracker.js"]');
  if (bySrc) return bySrc;
  // 3) currentScript (null para scripts async)
  const cur = document.currentScript;
  return cur instanceof HTMLScriptElement ? cur : null;
}

/** Site key pública do tenant. Ordem: global → ?k= no src → data-site-key. */
export function getSiteKey(): string | null {
  if (typeof window.__TRK_SITE_KEY__ === "string" && window.__TRK_SITE_KEY__) {
    return window.__TRK_SITE_KEY__;
  }
  const el = getScriptEl();
  if (el?.src) {
    try {
      const k = new URL(el.src).searchParams.get("k");
      if (k) return k;
    } catch {
      /* ignora src inválido */
    }
  }
  return el?.dataset.siteKey ?? null;
}

/** Base da API. Ordem: global → data-api → origem do src → build-time. */
export function getApiBase(): string {
  if (typeof window.__TRK_API__ === "string" && window.__TRK_API__) {
    return window.__TRK_API__.replace(/\/$/, "");
  }
  const el = getScriptEl();
  const attr = el?.dataset.api;
  if (attr) return attr.replace(/\/$/, "");
  if (el?.src) {
    try {
      return new URL(el.src).origin;
    } catch {
      /* cai para o build-time */
    }
  }
  if (typeof __API_BASE__ !== "undefined" && __API_BASE__) return __API_BASE__;
  return "";
}
