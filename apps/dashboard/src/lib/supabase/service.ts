import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client com SERVICE ROLE — faz BYPASS de RLS.
 * USAR APENAS no servidor, em caminhos que validam o escopo manualmente
 * (ingestão pública /api/track, webhooks). NUNCA expor ao browser.
 */
let cached: SupabaseClient | null = null;

export function createSupabaseServiceClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return cached;
}
