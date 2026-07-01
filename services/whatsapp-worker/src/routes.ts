import type { FastifyInstance } from "fastify";
import { createLogger } from "@trk/shared";
import { env } from "./supabase.js";
import { connectTenant, getSessionState } from "./whatsapp/manager.js";
import { dispatchConversion } from "./ingest/dispatch.js";

const log = createLogger({ mod: "routes" });

function authorized(token: string | undefined): boolean {
  return Boolean(token) && token === env.WORKER_SHARED_TOKEN;
}

function bearer(req: { headers: { authorization?: string } }): string | undefined {
  return req.headers.authorization?.replace(/^Bearer\s+/i, "");
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Conectar/retomar a sessão do tenant → devolve QR (se precisar escanear).
  app.post("/instances", async (req, reply) => {
    if (!authorized(bearer(req))) return reply.code(401).send({ error: "unauthorized" });
    const { tenantId } = (req.body as { tenantId?: string }) ?? {};
    if (!tenantId) return reply.code(400).send({ error: "tenantId obrigatório" });
    try {
      return reply.send(await connectTenant(tenantId));
    } catch (err) {
      log.error("falha ao conectar whatsapp", { err: String(err) });
      return reply.code(502).send({ error: "whatsapp_error" });
    }
  });

  // Estado atual (dashboard faz polling do QR/conexão).
  app.get("/instances/:tenantId/state", async (req, reply) => {
    if (!authorized(bearer(req))) return reply.code(401).send({ error: "unauthorized" });
    const { tenantId } = req.params as { tenantId: string };
    return reply.send(getSessionState(tenantId));
  });

  // Dispara envio de conversão server-side (usado pelo dashboard no PURCHASE).
  app.post("/dispatch", async (req, reply) => {
    if (!authorized(bearer(req))) return reply.code(401).send({ error: "unauthorized" });
    const { eventId } = (req.body as { eventId?: string }) ?? {};
    if (!eventId) return reply.code(400).send({ error: "eventId obrigatório" });
    dispatchConversion(eventId).catch((err) => log.error("dispatch falhou", { err: String(err) }));
    return reply.code(202).send({ ok: true });
  });
}
