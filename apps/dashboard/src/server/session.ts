import "server-only";
import type { NextRequest } from "next/server";

export interface LeadSession {
  [k: string]: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  screen: string | null;
  language: string | null;
  timezone: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

/** Deriva dispositivo/sistema/navegador de um User-Agent (sem dependências). */
export function parseUserAgent(ua: string | null): { device_type: string | null; os: string | null; browser: string | null } {
  if (!ua) return { device_type: null, os: null, browser: null };
  const s = ua.toLowerCase();

  // Sistema operacional
  let os: string | null = null;
  if (/iphone|ipad|ipod/.test(s)) os = "iOS";
  else if (/android/.test(s)) os = "Android";
  else if (/windows/.test(s)) os = "Windows";
  else if (/mac os x|macintosh/.test(s)) os = "macOS";
  else if (/linux/.test(s)) os = "Linux";

  // Tipo de dispositivo
  let device_type: string | null = "desktop";
  if (/ipad|tablet|(android(?!.*mobile))/.test(s)) device_type = "tablet";
  else if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(s)) device_type = "mobile";

  // Navegador (ordem importa: Edge/Opera antes de Chrome; Chrome antes de Safari)
  let browser: string | null = null;
  if (/edg\//.test(s)) browser = "Edge";
  else if (/opr\/|opera/.test(s)) browser = "Opera";
  else if (/samsungbrowser/.test(s)) browser = "Samsung Internet";
  else if (/chrome|crios/.test(s)) browser = "Chrome";
  else if (/firefox|fxios/.test(s)) browser = "Firefox";
  else if (/safari/.test(s)) browser = "Safari";

  return { device_type, os, browser };
}

/** Header opcional; decodifica cidade (a Vercel envia URL-encoded). */
function h(req: NextRequest, name: string, decode = false): string | null {
  const v = req.headers.get(name);
  if (!v) return null;
  try {
    return decode ? decodeURIComponent(v) : v;
  } catch {
    return v;
  }
}

/**
 * Monta a sessão first-touch a partir dos headers da requisição (User-Agent +
 * geo da Vercel) e do contexto do cliente (tela/idioma/fuso) vindo no evento.
 * Nunca guarda o IP cru — só a geo derivada.
 */
export function buildLeadSession(
  req: NextRequest,
  ctx: { screen?: unknown; lang?: unknown; tz?: unknown } | undefined,
): LeadSession {
  const { device_type, os, browser } = parseUserAgent(req.headers.get("user-agent"));
  const str = (v: unknown): string | null =>
    typeof v === "string" && v ? v.slice(0, 64) : null;
  return {
    device_type,
    os,
    browser,
    screen: str(ctx?.screen),
    language: str(ctx?.lang),
    timezone: str(ctx?.tz),
    country: h(req, "x-vercel-ip-country"),
    region: h(req, "x-vercel-ip-country-region"),
    city: h(req, "x-vercel-ip-city", true),
  };
}
