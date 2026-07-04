import { buildRefMarker } from "@trk/shared/trk";

const WA_SELECTOR = 'a[href*="wa.me"], a[href*="api.whatsapp.com"]';

/**
 * Mensagem padrão quando o botão de WhatsApp não tem texto: em vez de mandar
 * só o código, monta algo amigável com o produto + link (o WhatsApp gera o
 * preview com a imagem) para o atendente já saber o que o cliente quer.
 */
function defaultMessage(): string {
  try {
    const link = window.location.origin + window.location.pathname;
    const title = (document.title || "").replace(/\s*[|–—-]\s*[^|–—-]*$/, "").trim();
    const isProduct = /\/produto/i.test(window.location.pathname);
    if (isProduct && title) return `Olá! Tenho interesse neste produto: ${title}\n${link}`;
    return `Olá! Vim pelo site.${title ? ` (${title})` : ""}\n${link}`;
  } catch {
    return "Olá! Vim pelo site.";
  }
}

/** Insere o marcador `[Ref: TRK-XXXX]` no `text=` preservando o existente (idempotente). */
export function withMarker(href: string, marker: string): string | null {
  try {
    const u = new URL(href, window.location.href);
    const text = u.searchParams.get("text") ?? "";
    if (text.indexOf(marker) !== -1) return href; // já contém — não duplica
    const base = text || defaultMessage();
    u.searchParams.set("text", `${base}\n${marker}`);
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
