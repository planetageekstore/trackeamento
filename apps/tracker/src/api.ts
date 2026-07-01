import type { Origin } from "./parseUrl";

export type BrowserEventType = "PAGE_VIEW" | "WHATSAPP_CLICK" | "CHECKOUT";

interface SendOptions {
  origin?: Origin | null;
  data?: Record<string, unknown>;
}

/**
 * Envia um evento à API de ingestão de forma ASSÍNCRONA e resiliente (FR-006).
 * Usa `sendBeacon` (não bloqueia unload/navegação); fallback para `fetch keepalive`.
 * Qualquer erro é engolido — o site do cliente nunca quebra.
 */
export function sendEvent(
  apiBase: string,
  siteKey: string,
  trk: string,
  type: BrowserEventType,
  opts: SendOptions = {},
): void {
  try {
    const origin = opts.origin ?? null;
    const payload = {
      sk: siteKey,
      trk,
      events: [
        {
          type,
          occurred_at: new Date().toISOString(),
          url: origin?.landingPageUrl ?? window.location.href,
          referrer: origin?.referrer ?? (document.referrer || null),
          utm: origin?.utm,
          click_ids: origin?.clickIds,
          data: opts.data ?? {},
        },
      ],
    };
    const url = `${apiBase}/api/track`;
    const body = JSON.stringify(payload);

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
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
    /* silencioso por design (FR-006) */
  }
}
