import type { NextRequest } from "next/server";
import { createLogger } from "@trk/shared";
import { resolveTenant } from "@/server/tenant";
import { parseUserAgent, isBot } from "@/server/session";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { corsFor, jsonResponse, rateLimit } from "@/server/http";

export const runtime = "nodejs";
const log = createLogger({ route: "api/heatmap" });

const MAX_CELLS = 4000; // teto defensivo por requisição

/** Preflight CORS (o tracker usa fetch como fallback do sendBeacon). */
export function OPTIONS(req: NextRequest): Response {
  return new Response(null, { status: 204, headers: corsFor(req.headers.get("origin")) });
}

type Cell = [number, number, number];

function sanitizeCells(v: unknown): Cell[] {
  if (!Array.isArray(v)) return [];
  const out: Cell[] = [];
  for (const c of v) {
    if (!Array.isArray(c) || c.length < 3) continue;
    const x = Number(c[0]);
    const y = Number(c[1]);
    const w = Number(c[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w)) continue;
    if (x < 0 || x > 49 || y < 0 || w <= 0) continue;
    out.push([Math.floor(x), Math.floor(y), Math.min(Math.floor(w), 1_000_000)]);
    if (out.length >= MAX_CELLS) break;
  }
  return out;
}

/**
 * Ingestão pública e ANÔNIMA do mapa de calor. Recebe o resumo agregado da
 * visita (grade de movimento/click por página) e incrementa os contadores.
 * Sem TRK, sem vínculo com lead. Responde 202 sem vazar detalhes.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const cors = req.headers.get("origin");
  if (isBot(req.headers.get("user-agent"))) return jsonResponse({ ok: true }, 202, cors);
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, cors);
  }

  const body = (raw ?? {}) as Record<string, unknown>;
  const sk = typeof body.sk === "string" ? body.sk : "";
  let page = typeof body.page === "string" ? body.page : "";
  if (!sk || !page) return jsonResponse({ error: "invalid_payload" }, 400, cors);
  page = page.slice(0, 512); // limita cardinalidade/tamanho

  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!rateLimit(`hm:${sk}:${ip}`)) return jsonResponse({ error: "rate_limited" }, 429, cors);

  const tenant = await resolveTenant(sk, origin);
  if (!tenant) return jsonResponse({ error: "unauthorized" }, 403, cors);

  const moves = sanitizeCells(body.moves);
  const clicks = sanitizeCells(body.clicks);
  const w = Math.max(0, Math.min(Number(body.w) || 0, 20000));
  const h = Math.max(0, Math.min(Number(body.h) || 0, 200000));
  // Rolagem: linha máxima vista na visita → 1 voto naquele nível de profundidade.
  const scrollRow = Number(body.scroll);
  const scroll: Cell[] =
    Number.isFinite(scrollRow) && scrollRow > 0 ? [[0, Math.min(Math.floor(scrollRow), 100000), 1]] : [];

  // Dispositivo binário (desktop | mobile) derivado do User-Agent; tablet vai
  // para "mobile". Separa os mapas por tipo de tela.
  const dt = parseUserAgent(req.headers.get("user-agent")).device_type;
  const device = dt === "mobile" || dt === "tablet" ? "mobile" : "desktop";

  try {
    const supabase = createSupabaseServiceClient();
    await supabase
      .from("heatmap_page")
      .upsert(
        {
          tenant_id: tenant.id,
          page_path: page,
          device,
          width: w,
          height: h,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,page_path,device" },
      );
    const inc = (kind: string, cells: Cell[]) =>
      supabase.rpc("increment_heatmap_cells", {
        p_tenant: tenant.id,
        p_page: page,
        p_device: device,
        p_kind: kind,
        p_cells: cells,
      });
    if (moves.length > 0) await inc("move", moves);
    if (clicks.length > 0) await inc("click", clicks);
    if (scroll.length > 0) await inc("scroll", scroll);
  } catch (err) {
    log.error("falha ao gravar heatmap", { err: String(err), tenant: tenant.id });
  }

  return jsonResponse({ ok: true }, 202, cors);
}
