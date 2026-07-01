import { z } from "zod";

/**
 * Validação de variáveis de ambiente por componente. Cada app importa apenas
 * o parser que precisa e chama-o no boot para falhar cedo se algo faltar.
 */

const nonEmpty = z.string().min(1);

/** Backend do painel/API (Next.js on Supabase). */
export const dashboardEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  SECRETS_ENCRYPTION_KEY: nonEmpty, // chave mestra do pgcrypto (fora do banco)
  APP_URL: z.string().url().default("http://localhost:3000"),
  CDN_URL: z.string().url().optional(),
  WORKER_URL: z.string().url().optional(), // serviço always-on (Evolution/WhatsApp)
  WORKER_SHARED_TOKEN: z.string().optional(),
  NUVEMSHOP_CLIENT_ID: z.string().optional(),
  NUVEMSHOP_CLIENT_SECRET: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_API_VERSION: z.string().default("v21.0"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_DEVELOPER_TOKEN: z.string().optional(),
  GOOGLE_LOGIN_CUSTOMER_ID: z.string().optional(),
  CRON_SECRET: z.string().optional(), // protege /api/cron/*
});
export type DashboardEnv = z.infer<typeof dashboardEnvSchema>;

/** Serviço always-on (worker: WhatsApp via Baileys + envio de conversões). */
export const workerEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  SECRETS_ENCRYPTION_KEY: nonEmpty,
  WORKER_SHARED_TOKEN: nonEmpty, // auth dashboard <-> worker
  PORT: z.coerce.number().default(8080),
  // Envio de conversões server-side (US5) — opcionais
  META_API_VERSION: z.string().default("v21.0"),
  META_TEST_EVENT_CODE: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_DEVELOPER_TOKEN: z.string().optional(),
  GOOGLE_LOGIN_CUSTOMER_ID: z.string().optional(),
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Faz o parse e lança um erro legível se faltar variável. */
export function parseEnv<T extends z.ZodTypeAny>(schema: T, source: Record<string, unknown>): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  return result.data;
}
