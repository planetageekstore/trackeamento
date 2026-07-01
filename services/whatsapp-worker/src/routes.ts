import type { FastifyInstance } from "fastify";
import { evolutionMessageSchema } from "@trk/shared/schemas";
import { createLogger } from "@trk/shared";
import { env } from "./supabase.js";
import { messageQueue, enqueueDispatch } from "./queue.js";
import { provisionInstance, instanceState } from "./instances.js";

const log = createLogger({ mod: "routes" });

function authorized(token: string | undefined): boolean {
  return Boolean(token) && token === env.WEBHOOK_SHARED_TOKEN;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // --- Webhook de mensagens da Evolution → enfileira para processamento (T040)
  app.post("/webhooks/evolution", async (req, reply) => {
    const token = (req.query as { token?: string }).token;
    if (!authorized(token)) return reply.code(401).send({ error: "unauthorized" });

    const parsed = evolutionMessageSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(202).send({ ignored: true }); // ignora eventos fora do escopo
    const { instance, data } = parsed.data;
    if (data.key.fromMe) return reply.code(202).send({ ignored: true });

    await messageQueue.add("inbound", { instance, message: data }, {
      attempts: 5,
      backoff: { type: "custom" },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return reply.code(202).send({ ok: true });
  });

  // --- Proxy autenticado usado pelo dashboard para provisionar a instância
  app.post("/instances", async (req, reply) => {
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!authorized(auth)) return reply.code(401).send({ error: "unauthorized" });
    const { tenantId } = (req.body as { tenantId?: string }) ?? {};
    if (!tenantId) return reply.code(400).send({ error: "tenantId obrigatório" });
    try {
      const result = await provisionInstance(tenantId);
      return reply.send(result);
    } catch (err) {
      log.error("falha ao provisionar instância", { err: String(err), tenantId });
      return reply.code(502).send({ error: "evolution_error" });
    }
  });

  // --- Enfileira dispatch de conversão (usado pelo dashboard no PURCHASE)
  app.post("/dispatch", async (req, reply) => {
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!authorized(auth)) return reply.code(401).send({ error: "unauthorized" });
    const { eventId } = (req.body as { eventId?: string }) ?? {};
    if (!eventId) return reply.code(400).send({ error: "eventId obrigatório" });
    await enqueueDispatch(eventId);
    return reply.code(202).send({ ok: true });
  });

  // --- Estado da conexão (dashboard faz polling)
  app.get("/instances/:tenantId/state", async (req, reply) => {
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!authorized(auth)) return reply.code(401).send({ error: "unauthorized" });
    const { tenantId } = req.params as { tenantId: string };
    try {
      return reply.send({ state: await instanceState(tenantId) });
    } catch (err) {
      log.error("falha ao consultar estado", { err: String(err), tenantId });
      return reply.code(502).send({ error: "evolution_error" });
    }
  });
}
