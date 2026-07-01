import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseEnv, workerEnvSchema, type WorkerEnv } from "@trk/shared";

export const env: WorkerEnv = parseEnv(workerEnvSchema, process.env);

let cached: SupabaseClient | null = null;

/** Client service-role do worker (bypass RLS; valida escopo manualmente). */
export function supabase(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
