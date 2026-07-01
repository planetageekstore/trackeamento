import Fastify from "fastify";
import { createLogger } from "@trk/shared";
import { env } from "./supabase.js";
import { registerRoutes } from "./routes.js";
import { resumeSessions } from "./whatsapp/manager.js";

const log = createLogger({ svc: "whatsapp-worker" });

const app = Fastify({ logger: false });

app.get("/health", async () => ({ status: "ok", service: "whatsapp-worker" }));

async function main() {
  await registerRoutes(app);
  await app.listen({ host: "0.0.0.0", port: env.PORT });
  log.info("worker no ar", { port: env.PORT });

  // Retoma sessões de WhatsApp já autenticadas (sem re-scan de QR).
  resumeSessions().catch((err) => log.error("falha ao retomar sessões", { err: String(err) }));
}

main().catch((err) => {
  log.error("falha ao iniciar worker", { err: String(err) });
  process.exit(1);
});
