import "server-only";

/** Cabeçalhos CORS para o endpoint público de ingestão (tracker cross-origin). */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
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
