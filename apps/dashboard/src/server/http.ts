import "server-only";

/**
 * Cabeçalhos CORS do endpoint público de ingestão (tracker cross-origin).
 *
 * O `sendBeacon` envia em modo de credenciais "include"; nesse caso o navegador
 * NÃO aceita o curinga `*` — a resposta precisa refletir a origem exata e
 * declarar `Allow-Credentials: true`. É seguro aqui: a ingestão valida por
 * site-key + allowlist de domínio com service role e ignora cookies.
 */
export function corsFor(origin: string | null): Record<string, string> {
  if (origin) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
  }
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
  };
}

/** Compat: cabeçalhos estáticos (sem credenciais). Prefira `corsFor(origin)`. */
export const corsHeaders = corsFor(null);

export function jsonResponse(body: unknown, status: number, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsFor(origin) },
  });
}

/** Extrai o hostname de um header Origin/Referer. */
export function hostFromOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** host casa o domínio permitido (exato ou subdomínio). */
export function matchDomain(host: string, domain: string): boolean {
  const d = domain.toLowerCase().replace(/^\*\./, "");
  return host === d || host.endsWith(`.${d}`);
}

// Rate limit best-effort em memória (por instância). Mitigação simples; a
// proteção real vem da allowlist de domínio + validação server-side.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 120, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}
