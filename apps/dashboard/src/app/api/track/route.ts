import type { NextRequest } from "next/server";
import { schemas, createLogger } from "@trk/shared";
import { resolveTenant } from "@/server/tenant";
import { ingestEvents } from "@/server/ingest";
import { buildLeadSession, isBot } from "@/server/session";
import { corsFor, jsonResponse, rateLimit } from "@/server/http";

export const runtime = "nodejs";
const log = createLogger({ route: "api/track" });

/** Preflight CORS (fetch fallback do tracker). */
export function OPTIONS(req: NextRequest): Response {
  return new Response(null, { status: 204, headers: corsFor(req.headers.get("origin")) });
}

/**
 * Ingestão pública de eventos de origem (PAGE_VIEW/WHATSAPP_CLICK/CHECKOUT).
 * Valida site key + allowlist de domínio, enfileira/grava e responde 202.
 * Nunca retorna erro que quebre o tracker (o tracker ignora respostas ≠ 2xx).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const cors = req.headers.get("origin");
  // Ignora bots / navegadores headless / geradores de screenshot (não vira lead).
  if (isBot(req.headers.get("user-agent"))) return jsonResponse({ ok: true }, 202, cors);
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, cors);
  }

  const parsed = schemas.trackPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_payload" }, 400, cors);
  }
  const { sk, trk, events } = parsed.data;

  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!rateLimit(`${sk}:${ip}`)) {
    return jsonResponse({ error: "rate_limited" }, 429, cors);
  }

  const tenant = await resolveTenant(sk, origin);
  if (!tenant) {
    return jsonResponse({ error: "unauthorized" }, 403, cors);
  }

  // Sessão first-touch: dispositivo (User-Agent) + geo (headers Vercel) +
  // contexto do cliente (tela/idioma/fuso) que veio no PAGE_VIEW.
  const pv = events.find((e) => e.type === "PAGE_VIEW");
  const ctx = (pv?.data as { ctx?: { screen?: unknown; lang?: unknown; tz?: unknown; ga?: unknown } } | undefined)?.ctx;
  const session = buildLeadSession(req, ctx);

  try {
    await ingestEvents(tenant.id, trk, events, session);
  } catch (err) {
    // Falha interna não deve expor detalhes; loga e responde 202 para não
    // instruir o tracker a repetir de forma agressiva.
    log.error("falha na ingestão", { err: String(err), tenant: tenant.id });
  }

  return jsonResponse({ ok: true }, 202, cors);
}
