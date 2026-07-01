import { parseUtm, parseClickIds } from "@trk/shared/trk";
import type { UtmParams, ClickIds } from "@trk/shared";

/** Origem capturada no carregamento da página (FR-002/FR-004). */
export interface Origin {
  utm: UtmParams;
  clickIds: ClickIds;
  referrer: string | null;
  landingPageUrl: string;
}

/** Lê UTMs, click ids, referrer e URL de entrada a partir de `window.location`. */
export function parseOrigin(): Origin {
  const params = new URLSearchParams(window.location.search);
  return {
    utm: parseUtm(params),
    clickIds: parseClickIds(params),
    referrer: document.referrer || null,
    landingPageUrl: window.location.href,
  };
}
