"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Client Supabase para uso no browser (respeita RLS via sessão do usuário). */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
