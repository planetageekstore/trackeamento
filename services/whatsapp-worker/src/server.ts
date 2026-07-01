import Fastify from "fastify";
import { createLogger } from "@trk/shared";
import { env } from "./supabase.js";
import { registerRoutes } from "./routes.js";
import { startMessageWorker, startDispatchWorker } from "./queue.js";
import { processInboundMessage } from "./ingest/message.js";
import { dispatchConversion } from "./ingest/dispatch.js";

const log = createLogger({ svc: "whatsapp-worker" });

const app = Fastify({ logger: false });

app.get("/health", async () => ({ status: "ok", service: "whatsapp-worker" }));

async function main() {
  await registerRoutes(app);

  // Consumidor da fila de mensagens de entrada (WhatsApp → atribuição).
  const worker = startMessageWorker(async (job) => processInboundMessage(job.data));
  worker.on("failed", (job, err) => log.error("job de mensagem falhou", { id: job?.id, err: String(err) }));

  // Consumidor da fila de dispatch (conversões server-side → Meta/Google).
  const dispatcher = startDispatchWorker(async (job) => dispatchConversion(job.data.eventId));
  dispatcher.on("failed", (job, err) => log.error("job de dispatch falhou", { id: job?.id, err: String(err) }));

  await app.listen({ host: "0.0.0.0", port: env.PORT });
  log.info("worker no ar", { port: env.PORT });
}

main().catch((err) => {
  log.error("falha ao iniciar worker", { err: String(err) });
  process.exit(1);
});
