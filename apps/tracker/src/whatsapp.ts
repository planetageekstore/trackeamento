import { buildRefMarker } from "@trk/shared/trk";

const WA_SELECTOR = 'a[href*="wa.me"], a[href*="api.whatsapp.com"]';

/** Insere o marcador `[Ref: TRK-XXXX]` no `text=` preservando o existente (idempotente). */
export function withMarker(href: string, marker: string): string | null {
  try {
    const u = new URL(href, window.location.href);
    const text = u.searchParams.get("text") ?? "";
    if (text.indexOf(marker) !== -1) return href; // já contém — não duplica
    u.searchParams.set("text", text ? `${text} ${marker}` : marker);
    // URLSearchParams codifica espaço como "+"; wa.me espera %20 → normaliza.
    u.search = u.search.replace(/\+/g, "%20");
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Reescreve os links de WhatsApp da página anexando o marcador do TRK (FR-008)
 * e emite `WHATSAPP_CLICK` no clique (FR-022). Cobre botões inseridos
 * dinamicamente via MutationObserver. Idempotente por link (`data-saas-trk`).
 */
export function interceptWhatsApp(trackingCode: string, onClick?: () => void): void {
  const marker = buildRefMarker(trackingCode);

  const process = (): void => {
    try {
      const anchors = document.querySelectorAll<HTMLAnchorElement>(WA_SELECTOR);
      anchors.forEach((a) => {
        if (a.dataset.saasTrk === "1") return;
        const next = withMarker(a.href, marker);
        if (next) a.href = next;
        a.dataset.saasTrk = "1";
        if (onClick) a.addEventListener("click", onClick, { passive: true });
      });
    } catch {
      /* documento indisponível (ex.: teardown) — ignora */
    }
  };

  process();
  try {
    const observer = new MutationObserver(() => process());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch {
    /* MutationObserver indisponível — os links já presentes foram tratados */
  }
}
