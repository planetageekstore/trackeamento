// Descobre a configuração do tracker a partir da própria tag <script>.
// O snippet: <script async src=".../tracker.js" data-site-key="pk_live_..."></script>

declare const __API_BASE__: string;

function getScriptEl(): HTMLScriptElement | null {
  // `currentScript` é null para scripts async → buscar pela tag com data-site-key.
  const byAttr = document.querySelector<HTMLScriptElement>("script[data-site-key]");
  if (byAttr) return byAttr;
  const cur = document.currentScript;
  return cur instanceof HTMLScriptElement ? cur : null;
}

/** Site key pública do tenant (obrigatória). */
export function getSiteKey(): string | null {
  return getScriptEl()?.dataset.siteKey ?? null;
}

/** Base da API de ingestão. Ordem: data-api → build-time → origem do script. */
export function getApiBase(): string {
  const el = getScriptEl();
  const attr = el?.dataset.api;
  if (attr) return attr.replace(/\/$/, "");
  if (typeof __API_BASE__ !== "undefined" && __API_BASE__) return __API_BASE__;
  try {
    return new URL(el!.src).origin;
  } catch {
    return "";
  }
}
